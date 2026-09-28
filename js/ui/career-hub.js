// Career hub: a full-screen draggable city map with the HUD over it — resources (top left), your player (bottom
// left), the day clock (top right), the shortcut bar (bottom). Shortcuts open a drawer; events, match days and the
// Gazette open a card over the map; the last diary line flashes as a toast.

const HUB_DRAWERS = {
  me: ['👤', 'Player', run => youCard(run) + seasonCard(run)],
  team: ['🤝', 'Team', run => bondCard(run)],
  skills: ['✨', 'Skills', run => skillShop(run, true)],
  season: ['📅', 'Season', run => `<div class="panel">${calendar(run)}</div>` + seasonCard(run)],
  life: ['🏠', 'Life', run => lifeCard(run)],
  clubs: ['🛡', 'Clubs', run => clubsCard(run)],
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
  if (CW.drawer === 'clubs' && !World.isFree(run)) CW.drawer = null;
  const card = hubCard(run);
  $('#app').innerHTML = `<section class="career hub ${City.slot(run) === 'eve' ? 'eve' : ''}" style="--tc:${team.color}">
    <div class="mapwrap" id="mapwrap">${citySVG(run)}</div>
    ${hudRes(run)}${hudClock(run)}${hudMe(run)}${hudBar(run)}
    <div class="hud spotcard ${CW.spot && !card ? 'open' : ''}" id="spot">${CW.spot && !card ? spotCard(run) : ''}</div>
    ${toast ? `<div class="htoast" role="status">${esc(toast)}</div>` : ''}
    ${CW.drawer ? hubDrawer(run) : ''}
    ${card ? `<div class="hubmodal ${card.dim ? 'dim' : ''}"><div class="hubcard ${card.cls || ''}">${card.html}</div></div>` : ''}
  </section>`;
  mapInit();
}

/** A card over the map, if the week needs one: an event, a match day, or an unread Gazette. */
function hubCard(run) {
  const wt = Run.weekType(run);
  if (run.event) return { html: eventCard(run), dim: true };
  if (wt === 'cup') return { html: cupPanel(run), cls: 'wide' };
  if (wt === 'warmup' || wt === 'warmup2') return { html: warmupPanel(run) + (World.isFree(run) ? hubClubsHint() : '') };
  if (run.gazette && !run.gazette.read) return { html: gazetteCard(run), dim: true };
  return null;
}
const hubClubsHint = () =>
  `<p class="small mute">Free agent — <a href="#" onclick="hubOpen('clubs');return false">find a club</a> first to play with them.</p>`;

function hudRes(run) {
  const staPct = Math.round((run.sta / run.staMax) * 100),
    mood = MOODS[run.mood];
  return `<div class="hud res">
    <div ${tip(`You are in ${REGIONS[City.loc(run)].name}. Home: ${HOUSING[run.housing].name} (${REGIONS[City.homeRegion(run)].name})`)}><i>📍</i><b>${esc(REGIONS[City.loc(run)].name)}</b></div>
    <div ${tip('Money')}><i>💰</i><b>$${run.money.toLocaleString()}</b></div>
    <div ${tip('Fans')}><i>📣</i><b>${run.fans.toLocaleString()}</b></div>
    <div ${tip('Skill points')}><i>✨</i><b>${run.sp}</b></div>
    <div ${tip(`Stamina ${run.sta}/${run.staMax}`)}><i>⚡</i><span class="sbar ${staPct < 50 ? 'low' : ''}"><i style="width:${staPct}%"></i></span><small>${run.sta}</small></div>
    <div ${tip('Mood')}><i>☺</i><span class="mood m${run.mood}">${mood.name}</span></div>
  </div>`;
}

function hudClock(run) {
  const wt = Run.weekType(run),
    eve = City.slot(run) === 'eve',
    cup = Run.cupDef(run),
    match = wt === 'cup' || wt.startsWith('warmup'),
    pay = Math.ceil(run.week / ECON.payEvery) * ECON.payEvery - run.week,
    lab = cup ? cup.short : match ? 'Match' : eve ? 'Evening' : 'Day';
  return `<div class="hud clock ${eve ? 'eve' : ''} ${match ? 'match' : ''}">
    <div class="dial" ${tip(`Week ${run.week} of ${CAREER.weeks}${wt === 'camp' ? ' · training camp (×1.5)' : ''}${run.injury ? ' · injured' : ''}\nPayday ${pay ? `in ${pay} week${pay > 1 ? 's' : ''}` : 'this week'}\nDay: train, rest or relax — or travel. Evening: one outing where you are, or end the week.\nTravel: same area free · nearby takes the evening · the highlands take a day.\nTraining in your faction's region: home turf +${Math.round(TURF_BONUS * 100)}%.`)}>
      <span class="sky">${match ? '🏐' : eve ? '🌙' : '☀'}</span><b>W${run.week}</b><small>${lab}${wt === 'camp' ? ' · camp' : ''}</small>
      <svg viewBox="0 0 40 40"><circle class="trk" cx="20" cy="20" r="18"/><circle class="prg" cx="20" cy="20" r="18" style="stroke-dasharray:${((run.week / CAREER.weeks) * 113).toFixed(1)} 113"/></svg></div>
    ${eve && !run.event ? `<button class="btn hot endw" onclick="mapEndWeek()" ${tip('Skip the evening')}>End week ▸</button>` : ''}
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

function hudBar(run) {
  const you = Run.you(run),
    aff = Skills.forRole(you.role).filter(id => !you.skills.includes(id) && Skills.canLearn(run, id)).length,
    badge = { skills: aff, news: run.gazette && !run.gazette.read ? '!' : 0, clubs: 0 };
  return `<nav class="hud dock" aria-label="Shortcuts">${Object.entries(HUB_DRAWERS)
    .filter(([k]) => k !== 'me' && (k !== 'clubs' || World.isFree(run)))
    .map(
      ([k, [ic, name]]) =>
        `<button class="${CW.drawer === k ? 'on' : ''}" onclick="hubOpen('${k}')" aria-label="${name}"><i>${ic}</i><span>${name}</span>${badge[k] ? `<em>${badge[k]}</em>` : ''}</button>`
    )
    .join('')}</nav>`;
}

function hubDrawer(run) {
  const [ic, name, body] = HUB_DRAWERS[CW.drawer];
  return `<aside class="drawer" aria-label="${name}"><div class="dhd"><h3>${ic} ${name}</h3><button class="btn x" onclick="hubOpen(null)" aria-label="Close">✕</button></div><div class="dbody">${body(run)}</div></aside>`;
}

function hubOpen(k) {
  CW.drawer = k && CW.drawer !== k ? k : null;
  if (k === 'news' && RUN.gazette && !RUN.gazette.read) {
    RUN.gazette.read = true;
    Run.save(RUN);
  }
  renderCareer();
}
Screens.career = renderCareer;
