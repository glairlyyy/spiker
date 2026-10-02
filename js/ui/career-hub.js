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
  if (CW.drawer === 'clubs' && !World.isFree(run)) CW.drawer = null;
  const nextCup = Run.weekType(run) === 'cup' && !run.event ? Cup.upcoming(run) : null; // rules first, then draw
  const card = hubCard(run, nextCup);
  $('#app').innerHTML = `<section class="career hub ${City.night(run) ? 'eve' : ''}" style="--tc:${team.color}">
    <div class="mapwrap" id="mapwrap"></div>
    ${hudRes(run)}${hudClock(run)}${hudMe(run)}${hudBar(run)}
    <div class="hud spotcard ${CW.spot && !card ? 'open' : ''}" id="spot">${CW.spot && !card ? spotCard(run) : ''}</div>
    ${toast ? `<div class="htoast" role="status">${esc(toast)}</div>` : ''}
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
  if (wt === 'eval') return { html: evalPanel(run) + (World.isFree(run) ? hubClubsHint() : '') };
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
      <div class="evc"><button class="btn hot" onclick="clashSeen(true)"><b>Take a look</b><small>Show it on the map (${City.clashCost(run)} day${City.clashCost(run) > 1 ? 's' : ''} to get involved)</small></button><button class="btn" onclick="clashSeen(false)"><b>Stay out of it</b><small>It's on the map all week</small></button></div></div>`,
      dim: true
    };
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
    ${!match && !run.event ? `<button class="btn ${eve ? 'hot' : ''} endw" onclick="mapEndWeek()" ${tip(eve ? 'Sleep: start the next week' : `Skip the ${days} day${days > 1 ? 's' : ''} left`)}>End week ▸</button>` : ''}
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
    badge = { skills: aff, news: run.gazette && !run.gazette.read ? '!' : 0, clubs: 0, people: Asks.count(run) };
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
  if (k === 'news' && Run.readGazette(RUN)) Run.save(RUN);
  renderCareer();
}
Screens.career = renderCareer;
