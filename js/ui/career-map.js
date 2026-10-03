// The island map's UI: mounting the renderer (MapView, js/ui/map-view.js) with the model (MapModel), the panel for the
// selected place, and the actions behind its buttons. A week has 7 days: every action takes a day plus the trip there (by distance); the player ends the
// week. The map is dark where you haven't been: places show once explored; click any land to travel there.

/** Draw the map for this run (MapView = the renderer; MapModel = what to draw). */
function mapMount(run) {
  const el = $('#mapwrap');
  if (el) MapView.mount(el, MapModel.build(run, CW.spot), { pick: mapPick, point: mapPoint });
}
/** Empty map clicked: land → a point to travel to; sea → deselect. */
function mapPoint(p) {
  if (!City.onLand(p)) return mapPick(null);
  CW.spot = MapModel.ptId(p);
  renderCareer();
}

/** What committing to the selected place would put on the day track (ghost slots): trip days, then the day. [] if nothing. */
function spotGhost(run, id) {
  if (!id || run.event || Run.weekType(run) === 'cup' || Run.weekType(run) === 'eval') return [];
  const trips = (at, what) => [...Array.from({ length: City.trip(run, at) }, () => ({ k: 'trip', label: 'Trip' })), what];
  if (id.startsWith('hq')) {
    const ti = +id.slice(2);
    return ti === run.team || !run.teams[ti] ? [] : trips(CITY.hq[ti], { k: 'scout', label: 'Scout' });
  }
  if (id === 'clash') {
    const c = City.clashSite(run);
    return c ? trips(c.at, { k: 'battle', label: 'Battle' }) : [];
  }
  if (id.startsWith('pt:')) return Array.from({ length: City.travelDays(run, MapModel.ptOf(id)) }, () => ({ k: 'trip', label: 'Trip' }));
  if (!SPOTS[id]) return [];
  return trips(City.at(run, id), City.dayWhat(id));
}
/**
 * One place-panel anatomy for every kind (spec §10.1, HubRedesign): label (region · kind), title, tags, one flavour
 * line, the body (gains / roster / stakes), options, then ONE action row and the "uses {days}" line.
 */
function placeCard({ region, kind, title, tags = [], flavour = '', body = '', opts = '', row = [], split = '', uses = true }) {
  const g = uses ? spotGhost(RUN, CW.spot) : [],
    spent = WEEK_DAYS - City.days(RUN);
  return `<div class="spot plc"><div class="lab">${region ? `${chip(REGIONS[region] || REGIONS.open)}${esc((REGIONS[region] || REGIONS.open).name)} · ` : ''}${kind}</div>
    <h3 class="ptitle">${title}</h3>${tags.length ? `<div class="ptags">${tags.join('')}</div>` : ''}
    ${flavour ? `<p class="small mute pflav">${flavour}</p>` : ''}${body}${opts ? `<div class="popts">${opts}</div>` : ''}
    ${row.length ? `<div class="acts ${split || (row.length === 2 ? 'pri' : row.length === 3 ? 'three' : '')}">${row.join('')}</div>` : ''}
    ${g.length ? `<p class="small mute puse">Uses ${g.map((e, k) => WEEKDAYS[spent + k] || '—').join(' + ')} · shown on your week</p>` : ''}</div>`;
}
const ptag = (text, t, cls = '') => `<span class="ptag ${cls}" ${t ? tip(t) : ''}>${text}</span>`;
/** The tags every place shares: border / seized, trip days. */
function placeTags(run, sid, trip) {
  const s = SPOTS[sid],
    tile = s && s.region && Hex.ofSpot(sid),
    front = !!tile && Hex.frontier(run, tile.id),
    held = s && Front.seized(run, sid);
  return [
    held
      ? ptag('Seized', `Seized from ${REGIONS[s.region].name} in the street war`, 'warn')
      : front
        ? ptag('Border', GLOSSARY.border.long)
        : '',
    trip
      ? ptag(`Trip ${trip}d`, `Getting there takes ${trip} day${trip > 1 ? 's' : ''}, on top of the day there`, trip >= 2 ? 'warn' : '')
      : ''
  ].filter(Boolean);
}
/** The panel for the selected place: what it does and its buttons. */
function spotPanel(run, id) {
  if (!id) return `<p class="small mute">Pick a place on the map.</p>`;
  if (id.startsWith('hq')) return hqPanel(run, +id.slice(2));
  if (id === 'clash') return clashPanel(run);
  if (id.startsWith('venue:')) return venuePanel(run, id.slice(6));
  if (id.startsWith('pt:')) return pointPanel(run, MapModel.ptOf(id));
  const sid = id,
    s = SPOTS[sid],
    c = City.can(run, sid),
    cost = City.price(run, sid),
    at = City.at(run, sid),
    trip = City.trip(run, at),
    days = City.cost(run, sid),
    trOk = trip && !run.event && !City.noTime(run, trip),
    travel = trip
      ? `<button class="btn" onclick="mapTravel(${at[0]},${at[1]})" ${trOk ? '' : `disabled ${tip(City.noTime(run, trip) || 'answer the event first')}`}>Travel · ${trip}d</button>`
      : '',
    base = { region: City.region(run, sid), title: `${s.icon} ${esc(s.name)}`, tags: placeTags(run, sid, trip) };
  if (s.train) {
    const T = trainSpot(run, sid, c);
    return placeCard({ ...base, ...T, row: [T.go, travel].filter(Boolean) });
  }
  if (s.act === 'ramen')
    return placeCard({
      ...base,
      kind: 'Outing',
      flavour: esc(s.desc),
      body: `<p class="small">Pick who comes · $${cost} · ${days}d</p><div class="pmates">${Run.mates(run)
        .map(
          m =>
            `<button class="btn" onclick="mapGo('${sid}','${m.id}')" ${City.can(run, sid, m.id).ok ? '' : 'disabled'}>${faceSVG(m, 0, 22)} ${esc(m.name)} <small class="mute">Bond ${Run.you(run).bond[m.id] || 0}</small></button>`
        )
        .join('')}</div>${c.ok || c.why === 'pick a teammate' ? '' : `<p class="small mute">${esc(c.why)}</p>`}`,
      row: [travel].filter(Boolean)
    });
  const label = s.act === 'rest' ? 'Rest' : s.act === 'rec' ? 'Relax' : 'Go';
  return placeCard({
    ...base,
    kind: s.act === 'rest' ? 'Rest' : s.act === 'street' ? 'Street' : 'Place',
    flavour: esc(s.desc),
    body: `<p class="small">${cost ? `$${cost} · ` : ''}${days}d${sid === 'home' ? ` · ${esc(HOUSING[run.housing].name)} rest ×${World.restMul(run)}` : ''}</p>`,
    row: [
      `<button class="btn ${c.ok ? 'hot' : ''}" onclick="mapGo('${sid}')" ${c.ok ? '' : `disabled ${tip(c.why)}`}>${label} · ${days}d${cost ? ` · $${cost}` : ''}</button>`,
      travel
    ].filter(Boolean)
  });
}
/** Any point of the island: travel there (the fog lifts around it). */
/** The hex tile under a map point (spec §4.27): holder, ground, what it takes to seize it, and any pressure on it. */
function tileBlock(run, p) {
  const id = Hex.idAt(p),
    t = Hex.tile(id);
  if (!t) return '';
  const own = Hex.owner(run, id),
    H = Hex.state(run),
    short = r => esc(REGIONS[r].name.split(' ')[0]),
    ground = t.kind === 'place' ? 'place' : t.terrain === 'plain' ? 'open ground' : t.terrain,
    why = { hq: 'Capital — never falls', academy: 'Neutral ground — never taken', minor: 'Not in the war' }[t.kind],
    conds = MAJORS.filter(a => a !== own)
      .map(a => {
        const reach = Hex.targets(run, a, own).some(x => x.id === id);
        return `<span class="${reach ? '' : 'mute'}" ${reach ? '' : tip(`${REGIONS[a].name} can't reach it yet: no supplied tile next to it`)}>${chip(REGIONS[a])}${short(a)} needs <b>${Hex.cost(run, id, a)}</b></span>`;
      })
      .join(' · ');
  return `<div class="ptile small"><div>${chip(REGIONS[own])}<b>${esc(REGIONS[own].name)}</b> tile · ${ground}${
    t.region !== own ? ` <span class="mute">(taken from ${short(t.region)})</span>` : ''
  }</div><div ${tip(GLOSSARY.seize.long)}>${why ? `<span class="mute">${why}</span>` : `Seize: ${conds}`}</div>${
    H.p[id] ? `<div>${chip(REGIONS[H.by[id]])}${short(H.by[id])} pushing <b>${H.p[id]}/${Hex.cost(run, id, H.by[id])}</b></div>` : ''
  }</div>`;
}
function pointPanel(run, p) {
  const d = City.travelDays(run, p),
    seen = City.seen(run, p),
    r = City.regionAt(p),
    late = run.event ? 'answer the event first' : City.noTime(run, d);
  return placeCard({
    region: seen ? r : null,
    kind: 'Travel',
    title: `⚑ ${seen ? esc(REGIONS[r].name) : 'Unexplored land'}`,
    tags: d >= 2 ? [ptag(`Trip ${d}d`, '', 'warn')] : [],
    flavour: seen ? esc(REGIONS[r].desc) : 'Nobody you know has been out there. Go and see what you find.',
    body: tileBlock(run, p),
    row: [
      `<button class="btn hot" onclick="mapTravel(${p[0]},${p[1]})" ${late ? `disabled ${tip(late)}` : ''}>Travel here · ${d}d</button>`
    ]
  });
}
/** " · N days" on an action button. */
function dayTag(n) {
  return ` <small class="dt">${n}d</small>`;
}

/** This week's street battle: watch it or fight for a side — the three choices in one row, the stakes under the fights. */
function clashPanel(run) {
  const c = City.clashSite(run);
  if (!c) return `<p class="small mute">The street battle is over.</p>`;
  const d = City.clashCost(run),
    trip = d - 1,
    late = run.event ? 'answer the event first' : City.noTime(run, d),
    ban = City.fightBan(run),
    short = r => esc(REGIONS[r].name.split(' ')[0]),
    border = (w, l) => {
      const k = Front.stakes(run, w, l);
      return !k.tile
        ? `${short(w)} can't reach ${short(l)}`
        : k.seize
          ? `${short(w)} takes ${esc(k.name)}`
          : `${short(w)} ${k.meter}/${k.cost} on ${esc(k.name)}`;
    },
    stake = (side, foe) =>
      `<div class="stake small">${chip(REGIONS[side])}<b>${short(side)}</b> · ${term('sta', -CLASH.sta, 'cost')} · injury ~${Math.round(City.injuryRisk(run, City.crewOvr(run, foe)) * 100)}%<br><span class="wl">Win</span> ${term('standing', CLASH.win)} ${short(side)} ${term('standing', CLASH.other)} ${short(foe)} ${term('fans', CLASH.fans)} · ${border(side, foe)}<br><span class="wl">Lose</span> ${term('standing', CLASH.lose)} ${short(side)} · ${border(foe, side)}</div>`,
    fight = side =>
      `<button class="btn" onclick="mapClash('${side}')" ${late || ban ? `disabled ${tip(ban || late)}` : tip(`A real match with their crew — XP, techniques and a grade like an evaluation. +${CLASH.fans} fans for a win; a loss costs ${LOSS.sta} more stamina and mood, and fans if by ${LOSS.heavy}+ points. −${CLASH.sta} stamina`)}>${chip(REGIONS[side])}Fight for ${short(side)}</button>`,
    st = r => `${chip(REGIONS[r])}${esc(REGIONS[r].name)} <b>${signed(City.rep(run, r))}</b>`;
  return placeCard({
    region: null,
    kind: 'Street battle',
    title: `⚔ ${esc(REGIONS[c.a].name)} vs ${esc(REGIONS[c.b].name)}`,
    tags: [ptag(esc(c.name)), trip ? ptag(`Trip ${trip}d`, '', trip >= 2 ? 'warn' : '') : ''].filter(Boolean),
    flavour: 'Crews from both sides are settling it on the street this week.',
    body: `<p class="small">${term('standing')} ${st(c.a)} · ${st(c.b)}</p><div class="pstakes">${stake(c.a, c.b)}${stake(c.b, c.a)}</div>`,
    row: [
      `<button class="btn" onclick="mapClash(null)" ${late ? `disabled ${tip(late)}` : tip(`See both sides' clubs in action: scouts them. −${CLASH.watchSta} stamina`)}>Watch · ${d}d</button>`,
      fight(c.a),
      fight(c.b)
    ],
    opts:
      late || ban
        ? ''
        : `<span class="small mute">Sim a fight:</span> <button class="btn" onclick="mapClash('${c.a}', true)">⏭ ${short(c.a)}</button> <button class="btn" onclick="mapClash('${c.b}', true)">⏭ ${short(c.b)}</button>`
  });
}

/** Quality of a training place as the player knows it. */
function qualityTag(run, id) {
  const Q = City.quality(run, id),
    reg = REGIONS[SPOTS[id].region];
  if (!Q.known)
    return reg.hype
      ? `<span class="qt unk" ${tip(GLOSSARY.quality.long)}>Premium?</span>`
      : `<span class="qt unk" ${tip(GLOSSARY.quality.long)}>Rough?</span>`;
  const stars = Q.q >= 1.3 ? '★★★★' : Q.q >= 1.2 ? '★★★' : Q.q >= 0.95 ? '★★' : '★';
  return `<span class="qt ${Q.tag}" ${tip(`Training quality ×${Q.q}`)}>${stars}${Q.tag === 'gem' ? ' gem' : Q.tag === 'overhyped' ? ' overhyped' : ''}</span>`;
}

/** A training place's parts for placeCard: kind, tags, flavour, gain rows, options (Normal / Hard, teammates), the Train button. */
function trainSpot(run, id, c) {
  const s = SPOTS[id],
    key = s.train,
    T = Run.myTeam(run),
    hard = CW.hard && !run.injury,
    Q = City.quality(run, id),
    x = (Q.known ? Q.q : (REGIONS[s.region] || REGIONS.open).q) * (1 + City.turf(run, id)), // preview at the advertised quality
    pv = Training.preview(run, key, hard, x),
    turf = City.turf(run, id),
    gain = ([k, , xp], role) => {
      if (pv.cap && k === pv.main[0])
        return `<div class="pgain"><span class="pi">${statI(statKey(k), 20)}</span><span>${STATNAME[k]} <i class="mute">· ${role}</i></span><b class="mute">at ${pv.cap} — matches only</b></div>`;
      // sessions until this stat's next point at this rate
      const pr = Training.progress(run, k),
        n = Math.max(1, Math.ceil((pr.need - pr.have) / Math.max(0.01, xp)));
      return `<div class="pgain"><span class="pi">${statI(statKey(k), 20)}</span><span>${STATNAME[k]} <i class="mute">· ${role}</i></span>${n <= 1 ? '<b class="up">+1 now</b>' : `<span class="mute">+1 in ${n}</span>`}</div>`;
    },
    mates = pv.mates.filter(pid => squadOf(T).some(p => p.id === pid)), // a teammate who has since left
    seg = `<div class="seg"><button class="btn ${hard ? '' : 'on'}" onclick="CW.hard=false;mapPick(CW.spot)">Normal</button><button class="btn ${hard ? 'on' : ''}" ${run.injury ? `disabled ${tip('Injured: light training only')}` : ''} onclick="CW.hard=true;mapPick(CW.spot)">Hard <small>×${TRAIN_X.hard.gain} · ×${TRAIN_X.hard.sta} sta · ${Math.round(TRAIN_X.hard.fail * 100)}% fail</small></button></div>`,
    chips = mates.length
      ? `<div class="pmates"><span class="small mute">Training here</span>${mates
          .map(pid => {
            const m = squadOf(T).find(p => p.id === pid);
            return `<span class="pchip">${faceSVG(m, 0.3, 18)}${esc(m.name.split(' ')[0])} +${(Run.you(run).bond[pid] || 0) >= 80 ? 50 : 20}%</span>`;
          })
          .join('')}</div>`
      : '';
  return {
    kind: 'Training',
    tags: [
      qualityTag(run, id),
      s.sand ? ptag(`Sand ×${SAND_SP} pts`, `Sand training builds technique: skill points ×${SAND_SP}`) : '',
      ptag(
        `Lv ${pv.lvl}${pv.next != null ? ` · ${pv.next} to Lv ${pv.lvl + 1}` : ''}`,
        `Facility level: training quality grows with use. Training stops a stat at ${TRAIN_CAP}; matches only above.`
      ),
      pv.streak ? ptag(`Streak +${Math.round(pv.streak * 100)}%`, 'Same training in a row') : '',
      turf ? ptag(`Turf +${Math.round(turf * 100)}%`, "Your faction's region") : '',
      pv.fail
        ? ptag(
            `${Math.round(pv.fail * 100)}% fail`,
            `Below 50 stamina training can fail — below ${TRAIN_X.injuryAt} it can injure you.`,
            pv.fail > 0.25 ? 'bad' : 'warn'
          )
        : '',
      ...placeTags(run, id, City.trip(run, City.at(run, id)))
    ].filter(Boolean),
    flavour: esc(s.desc || ''),
    body: gain(pv.main, 'main') + gain(pv.side, 'side'),
    opts: seg + chips,
    go: `<button class="btn ${c.ok ? 'hot' : ''}" onclick="mapGo('${id}')" ${c.ok ? '' : `disabled ${tip(c.why)}`}>Train ${TRAININGS[key].name} · ${term('day', String(City.cost(run, id)), 'cost')} ${term('sta', -pv.sta, 'cost')} $${City.price(run, id)}</button>`
  };
}

/** The challenge block of a club's card: stake stepper, the verdict ("Accepts: likely — why"), the button and Sim ⏭. */
function challengeBlock(run, ti) {
  const W = City.worth(run, ti, (CW.stake || {})[ti] || 0);
  if (!W) return '';
  const side = City.challengeSide(run),
    st = Math.min((CW.stake || {})[ti] || 0, City.stakeMax(run)),
    cost = City.scoutCost(run, ti),
    late = run.event
      ? 'answer the event first'
      : City.fightBan(run) || City.noTime(run, cost) || (run.money < side.cost ? `needs $${side.cost} for a street crew` : ''),
    risk = Math.round(City.injuryRisk(run, run.teams[ti].ovr) * 100),
    hot = W.verdict === 'likely' ? 'hot' : '';
  return `<section class="pchal" ${tip('Challenge their squad for a stake: they may refuse. Win and the stake pays at odds; lose and it is gone. XP and techniques as in any match')}><div class="lab">Challenge</div>
    <p class="small ${W.verdict === 'refuses' ? 'mute' : ''}">Accepts: <b>${W.verdict}</b> — ${esc(W.why)}${side.kind === 'hired' ? ` · street crew $${side.cost}` : ''} · <span ${tip('Before the match: grows with their rating above yours, how badly you lose, low stamina and fighting again soon. Win or lose.')}>injury ~${risk}%</span></p>
    <div class="popts"><span class="small">Stake</span> <button class="btn" onclick="mapStake(${ti},-1)" ${st <= 0 ? 'disabled' : ''}>−</button> <b>$${st}</b> <button class="btn" onclick="mapStake(${ti},1)" ${st + CHALLENGE.stakeStep > City.stakeMax(run) ? 'disabled' : ''}>+</button></div>
    <div class="acts pri"><button class="btn ${hot}" onclick="mapChallenge(${ti})" ${late ? `disabled ${tip(late)}` : ''}>Challenge · ${cost}d</button><button class="btn" onclick="mapChallenge(${ti}, true)" ${late ? 'disabled' : ''} ${tip(GLOSSARY.sim.long)}>Sim ⏭</button></div></section>`;
}
/** An official venue's card (spec §4.21): what is held there, and whether your match is there this week. */
function venuePanel(run, id) {
  const v = VENUES[id];
  if (!v) return '';
  return placeCard({
    region: v.region,
    kind: 'Venue',
    title: `🏟 ${esc(v.name)}`,
    tags: City.venue(run) === id ? [ptag('This week: your match', '', 'sel')] : [],
    body: `<p class="small">Held here: ${v.held.map(esc).join(' · ')}.</p>`,
    uses: false
  });
}
function hqPanel(run, ti) {
  const t = run.teams[ti],
    f = FACTIONS[ti],
    free = World.isFree(run),
    j = World.canJoin(run, ti),
    sc = City.scoutCost(run, ti),
    late = run.event ? 'answer the event first' : City.noTime(run, sc),
    seen = City.scouted(run, ti);
  const roster = seen
    ? `<div class="roster small">${squadOf(t)
        .map(
          p =>
            `<span>${faceSVG(p, 0, 22)}${stag(p)}${esc(p.name)} <i class="mute">${p.role} ${ovr(p)}${t.bench && t.bench.includes(p) ? ' · bench' : ''}</i>${p.elOn ? ` <b style="color:${ECOL[p.el]}">${ENAME[p.el]}</b>` : ''}${Skills.techs(p).length ? ` <span class="mute">· ${esc(Skills.techs(p).join(', '))}</span>` : ''}</span>`
        )
        .join('')}</div>`
    : '';
  const habits = seen ? `<p class="small mute">${esc(Dossier.habitText(Dossier.habits(t)))}</p>` : '';
  return placeCard({
    region: f.region,
    kind: ti === run.team ? 'Your club' : 'Club HQ',
    title: `${chip(t)}${esc(t.name)}`,
    tags: [
      ptag(`Rating ${t.ovr}`),
      City.rep(run, f.region) ? ptag(`⚑ ${signed(City.rep(run, f.region))}`, GLOSSARY.standing.long) : '',
      free ? ptag(esc(World.joinText(ti, run)), 'What they ask', j.ok ? 'sel' : '') : ''
    ].filter(Boolean),
    flavour: `${esc(f.front)}.${seen ? ` Word is: ${esc(f.dark)}.` : ''}`,
    body: roster + habits,
    row: [
      free
        ? `<button class="btn ${j.ok ? 'hot' : 'lock'}" onclick="joinClub(${ti})" ${j.ok ? '' : `disabled ${tip('Missing: ' + j.why.join(', '))}`}>${j.ok ? 'Sign' : esc(joinGap(run, ti))}</button>`
        : '',
      ti !== run.team
        ? `<button class="btn" onclick="mapScout(${ti})" ${late ? `disabled ${tip(late)}` : tip(`A day at their HQ${sc > 1 ? ' (+ the trip)' : ''}: see their roster and elements, hear a rumour. −${SCOUT_STA} stamina`)}>${seen ? 'Scout again' : 'Scout'} · ${sc}d</button>`
        : '',
      `<button class="btn" onclick="openDossier('${f.region}')" ${tip(`Everything you know about ${REGIONS[f.region].name}`)}>Dossier</button>`
    ].filter(Boolean),
    split: free ? 'three' : 'two'
  }).replace(/<\/div>$/, `${challengeBlock(run, ti)}</div>`);
}

/** The floating card for the selected place. */
function spotCard(run) {
  return `<button class="btn x" onclick="mapPick(null)" aria-label="Close">✕</button>${spotPanel(run, CW.spot)}`;
}
function mapPick(id) {
  CW.spot = id;
  const el = $('#spot');
  if (!el) return renderCareer();
  el.innerHTML = id ? spotCard(RUN) : '';
  el.classList.toggle('open', !!id);
  MapView.select(id);
  const wk = document.querySelector('.wweek'); // ghost slots follow the selection
  if (wk) wk.outerHTML = weekSection(RUN);
}

/** Spend a day at a place (+ the trip); the week's one event may come after the first day. Never ends the week. */
function mapGo(id, mate) {
  const run = RUN;
  if (!SPOTS[id] || !City.can(run, id, mate).ok) return;
  Run.log(run, City.day(run, id, CW.hard, mate));
  mapAfter(run);
}
function mapAfter(run) {
  City.after(run);
  Run.save(run);
  renderCareer();
}
function mapClash(side, sim) {
  if (side) {
    // fighting: a real match (watch it, or sim it at once)
    const fx = Fight.clash(RUN, side);
    if (!fx) return;
    if (!sim) return navigate('match', fx);
    Cup.simNow(fx);
  } else {
    const line = City.clash(RUN, null);
    if (!line) return;
    Run.log(RUN, line);
  }
  CW.spot = null;
  mapAfter(RUN);
}
/** Close the week-start battle popup; look = select its pin. */
function clashSeen(look) {
  if (!RUN.clash) return;
  RUN.clash.seen = true;
  if (look) CW.spot = 'clash';
  Run.save(RUN);
  renderCareer();
}
/** Step the stake of a challenge to club ti. */
function mapStake(ti, d) {
  const S = (CW.stake = CW.stake || {});
  S[ti] = clamp((S[ti] || 0) + d * CHALLENGE.stakeStep, 0, City.stakeMax(RUN));
  mapPick(`hq${ti}`);
}
/** Challenge club ti at the chosen stake: refused (diary line) or played (watch, or sim = the result at once). */
function mapChallenge(ti, sim) {
  const r = City.challenge(RUN, ti, (CW.stake || {})[ti] || 0);
  if (!r) return;
  CW.spot = `hq${ti}`;
  if (r.accepted) {
    const fx = Fight.challenge(RUN, ti, r.stake);
    if (!fx) return;
    if (!sim) return navigate('match', fx);
    Cup.simNow(fx);
  } else Run.log(RUN, r.line);
  mapAfter(RUN);
}
function mapScout(ti) {
  const line = City.scout(RUN, ti);
  if (!line) return;
  Run.log(RUN, line);
  CW.spot = `hq${ti}`;
  mapAfter(RUN);
}
/** Just travel to a point (its trip days, at least one). */
function mapTravel(x, y) {
  const line = City.travelTo(RUN, [x, y]);
  if (!line) return;
  Run.log(RUN, line);
  if (CW.spot && CW.spot.startsWith('pt:')) CW.spot = null;
  Run.save(RUN);
  renderCareer();
}
function mapEndWeek() {
  if (!Run.canEndWeek(RUN)) return;
  if (City.days(RUN) > 0 && Date.now() - CW.endArm >= 4000) {
    CW.endArm = Date.now(); // days unused: ask once more within 4 s
    setTimeout(() => document.querySelector('.hub .endw') && renderCareer(), 4100);
    return renderCareer();
  }
  CW.endArm = 0;
  endWeekUI();
}
