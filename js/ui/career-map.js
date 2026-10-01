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

/** The panel for the selected place: what it does and its buttons. */
function spotPanel(run, id) {
  if (!id) return `<p class="small mute">Pick a place on the map.</p>`;
  if (id.startsWith('hq')) return hqPanel(run, +id.slice(2));
  if (id === 'clash') return clashPanel(run);
  if (id.startsWith('pt:')) return pointPanel(run, MapModel.ptOf(id));
  const sid = id,
    s = SPOTS[sid],
    c = City.can(run, sid),
    reg = REGIONS[City.region(run, sid)] || REGIONS.open,
    cost = City.price(run, sid),
    at = City.at(run, sid),
    trip = City.trip(run, at),
    days = City.cost(run, sid),
    go = (label, arg = '') =>
      `<button class="btn ${c.ok ? 'hot' : ''}" onclick="mapGo('${sid}'${arg})" ${c.ok ? '' : `disabled ${tip(c.why)}`}>${label}${dayTag(days)}</button>`,
    trOk = trip && !run.event && !City.noTime(run, trip);
  let body = '';
  if (s.train) body = trainSpot(run, sid, c);
  else if (s.act === 'ramen')
    body = `<p class="small">${esc(s.desc)} · $${cost}</p><div class="trow">${Run.mates(run)
      .map(
        m =>
          `<button class="btn" onclick="mapGo('${sid}','${m.id}')" ${City.can(run, sid, m.id).ok ? '' : 'disabled'}>${faceSVG(m, 0, 22)} ${esc(m.name)} <small class="mute">${Run.you(run).bond[m.id] || 0}</small></button>`
      )
      .join('')}${dayTag(days)}</div>${c.ok || c.why === 'pick a teammate' ? '' : `<p class="small mute">${esc(c.why)}</p>`}`;
  else
    body = `<p class="small">${esc(s.desc)}${cost ? ` · $${cost}` : ''}${sid === 'home' ? ` · ${esc(HOUSING[run.housing].name)} ×${World.restMul(run)}` : ''}</p><div class="trow">${go(s.act === 'rest' ? 'Rest' : s.act === 'rec' ? 'Relax' : 'Go')}</div>`;
  const front = s.region && Object.values(FRONT.borders).some(B => Object.values(B).some(l => l.includes(sid))),
    held = Front.seized(run, sid);
  return `<div class="spot"><h4>${s.icon} ${esc(s.name)} <span class="mute small" ${tip(reg.desc)}>${esc(reg.name)}</span>${
    held
      ? ` <span class="stk far" ${tip(`Seized from ${REGIONS[s.region].name} in the street war`)}>Seized</span>`
      : front
        ? ` <span class="stk" ${tip('A border place: it changes hands if the neighbours win enough street battles')}>Border</span>`
        : ''
  }${
    trip
      ? ` <span class="stk ${trip >= 2 ? 'far' : ''}" ${tip(`Getting there takes ${trip} day${trip > 1 ? 's' : ''}, on top of the day there`)}>Trip: ${trip} day${trip > 1 ? 's' : ''}</span>`
      : ''
  }</h4>${body}${trip ? `<div class="trow"><button class="btn" onclick="mapTravel(${at[0]},${at[1]})" ${trOk ? '' : `disabled ${tip(City.noTime(run, trip) || 'answer the event first')}`}>Just travel there${dayTag(trip)}</button></div>` : ''}</div>`;
}
/** Any point of the island: travel there (the fog lifts around it). */
function pointPanel(run, p) {
  const d = City.travelDays(run, p),
    seen = City.seen(run, p),
    r = REGIONS[City.regionAt(p)],
    late = run.event ? 'answer the event first' : City.noTime(run, d);
  return `<div class="spot"><h4>⚑ ${seen ? esc(r.name) : 'Unexplored land'}${
    d >= 2 ? ` <span class="stk far">Trip: ${d} days</span>` : ''
  }</h4><p class="small">${seen ? esc(r.desc) : 'Nobody you know has been out there. Go and see what you find.'}</p>
    <div class="trow"><button class="btn hot" onclick="mapTravel(${p[0]},${p[1]})" ${late ? `disabled ${tip(late)}` : ''}>Travel here${dayTag(d)}</button></div></div>`;
}
/** " · N days" on an action button. */
function dayTag(n) {
  return ` <small class="dt">${n}d</small>`;
}

/** This week's street battle: watch it or fight for a side. */
function clashPanel(run) {
  const c = City.clashSite(run);
  if (!c) return `<p class="small mute">The street battle is over.</p>`;
  const d = City.clashCost(run),
    trip = d - 1,
    late = run.event ? 'answer the event first' : City.noTime(run, d),
    btn = (side, label, t) =>
      `<button class="btn ${side ? 'hot' : ''}" onclick="mapClash(${side ? `'${side}'` : 'null'})" ${late ? `disabled ${tip(late)}` : tip(t)}>${label}${dayTag(d)}</button>`,
    fight = (side, foe) =>
      `<span class="btns">${btn(
        side,
        `Fight for ${esc(REGIONS[side].name)}`,
        `A real match with their crew — XP, techniques and a grade like an evaluation. Win: +${CLASH.win} standing with ${REGIONS[side].name}, +${CLASH.fans} fans. Lose: ${CLASH.lose}. Either way ${CLASH.other} with ${REGIONS[foe].name}. −${CLASH.sta} stamina`
      )}${late ? '' : `<button class="btn" onclick="mapClash('${side}', true)" ${tip('Get the result without watching')}>⏭</button>`}</span>`,
    st = r => `${esc(REGIONS[r].name)} <b>${City.rep(run, r) > 0 ? '+' : ''}${City.rep(run, r)}</b>`;
  return `<div class="spot"><h4>⚔ Street battle <span class="mute small">${esc(REGIONS[c.a].name)} vs ${esc(REGIONS[c.b].name)} · ${esc(c.name)}</span>${
    trip ? ` <span class="stk ${trip >= 2 ? 'far' : ''}">Trip: ${trip} day${trip > 1 ? 's' : ''}</span>` : ''
  }</h4><p class="small">Crews from both sides are settling it on the street this week. Standing: ${st(c.a)} · ${st(c.b)}</p>
    <div class="trow">${btn(null, 'Watch', `See both sides' clubs in action: scouts them. −${CLASH.watchSta} stamina`)}${fight(c.a, c.b)}${fight(c.b, c.a)}</div></div>`;
}

/** Quality of a training place as the player knows it. */
function qualityTag(run, id) {
  const Q = City.quality(run, id),
    reg = REGIONS[SPOTS[id].region];
  if (!Q.known)
    return reg.hype
      ? `<span class="qt unk" ${tip('Advertised as top class. Some city places are overhyped — you find out by training there.')}>Premium?</span>`
      : `<span class="qt unk" ${tip('Rough and cheap. Now and then one is a hidden gem — you find out by training there.')}>Rough?</span>`;
  const stars = Q.q >= 1.3 ? '★★★★' : Q.q >= 1.2 ? '★★★' : Q.q >= 0.95 ? '★★' : '★';
  return `<span class="qt ${Q.tag}" ${tip(`Training quality ×${Q.q}${Q.tag === 'gem' ? ' — a hidden gem' : Q.tag === 'overhyped' ? ' — overhyped' : ''}`)}>${stars}${Q.tag === 'gem' ? ' gem' : Q.tag === 'overhyped' ? ' overhyped' : ''}</span>`;
}

function trainSpot(run, id, c) {
  const s = SPOTS[id],
    key = s.train,
    T = Run.myTeam(run),
    hard = CW.hard && !run.injury,
    Q = City.quality(run, id),
    x = (Q.known ? Q.q : (REGIONS[s.region] || REGIONS.open).q) * (1 + City.turf(run, id)), // preview at the advertised quality
    pv = Training.preview(run, key, hard, x),
    turf = City.turf(run, id),
    fmt = ([k, , xp]) => {
      if (pv.cap && k === pv.main[0]) return `${STATNAME[k]} at ${pv.cap} — matches only`;
      // how much this session moves the stat, compared with what its next point costs at your level
      const r = xp / Training.progress(run, k).need,
        g = r >= 2.5 ? ['High', 'hi'] : r >= 1 ? ['Mid', 'md'] : ['Low', 'lo'];
      return `${STATNAME[k]} <span class="gl ${g[1]}">${g[0]}</span>`;
    },
    mates = pv.mates.filter(pid => squadOf(T).some(p => p.id === pid)); // a teammate who has since left
  return `<div class="tline">${qualityTag(run, id)} <b class="g">${fmt(pv.main)}</b> <span class="g2">${fmt(pv.side)}</span> <span class="mute small">−${pv.sta} sta · $${City.price(run, id)} · Lv ${pv.lvl}</span>
      ${pv.fail ? `<span class="f ${pv.fail > 0.25 ? 'hi' : 'md'}">${Math.round(pv.fail * 100)}% fail</span>` : ''}
      ${pv.streak ? `<span class="stk" ${tip('Same training in a row')}>Streak +${Math.round(pv.streak * 100)}%</span>` : ''}
      ${turf ? `<span class="stk" ${tip("Your faction's region")}>Turf +${Math.round(turf * 100)}%</span>` : ''}
      ${s.sand ? `<span class="stk" ${tip(`Sand training builds technique: skill points ×${SAND_SP}`)}>Sand ×${SAND_SP} pts</span>` : ''}
      ${info(`Facility Lv ${pv.lvl}${pv.next != null ? ` — ${pv.next} more sessions to Lv ${pv.lvl + 1}` : ' (max)'}. Training stops a stat at ${TRAIN_CAP}; matches only above. Teammates here: +20% each (+50% at bond 80+). Below 50 stamina training can fail — below ${TRAIN_X.injuryAt} it can injure you.`)}</div>
    <div class="trow"><span class="fl">${mates
      .map(pid =>
        faceSVG(
          squadOf(T).find(p => p.id === pid),
          0.3,
          24
        )
      )
      .join('')}</span>
      <label class="hardt ${run.injury ? 'dis' : ''}" ${tip(`×${TRAIN_X.hard.gain} gains, skill pts ×1.5, ×${TRAIN_X.hard.sta} stamina, +${Math.round(TRAIN_X.hard.fail * 100)}% fail`)}><input type="checkbox" ${hard ? 'checked' : ''} ${run.injury ? 'disabled' : ''} onchange="CW.hard=this.checked;mapPick(CW.spot)"> Hard</label>
      <button class="btn ${c.ok ? 'hot' : ''}" onclick="mapGo('${id}')" ${c.ok ? '' : `disabled ${tip(c.why)}`}>Train ${TRAININGS[key].name}${dayTag(City.cost(run, id))}</button></div>`;
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
      : City.noTime(run, cost) || (run.money < side.cost ? `needs $${side.cost} for a street crew` : ''),
    hot = W.verdict === 'likely' ? 'hot' : '';
  return `<div class="trow chal" ${tip('Challenge their squad for a stake: they may refuse. Win and the stake pays at odds; lose and it is gone. XP and techniques as in any match')}><span class="small">Stake <button class="btn" onclick="mapStake(${ti},-1)" ${st <= 0 ? 'disabled' : ''}>−</button> <b>$${st}</b> <button class="btn" onclick="mapStake(${ti},1)" ${st + CHALLENGE.stakeStep > City.stakeMax(run) ? 'disabled' : ''}>+</button></span>
    <button class="btn ${hot}" onclick="mapChallenge(${ti})" ${late ? `disabled ${tip(late)}` : ''}>Challenge${dayTag(cost)}</button>
    <button class="btn" onclick="mapChallenge(${ti}, true)" ${late ? 'disabled' : ''} ${tip('Get the result without watching')}>⏭</button>
    <span class="small ${W.verdict === 'refuses' ? 'mute' : ''}">Accepts: <b>${W.verdict}</b> — ${esc(W.why)}${side.kind === 'hired' ? ` · street crew $${side.cost}` : ''}</span></div>`;
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
  return `<div class="spot" style="--tc:${t.color}"><h4>${chip(t)}${esc(t.name)} <span class="mute small">${esc(REGIONS[f.region].name)} · rating ${t.ovr}</span></h4>
    <p class="small">${esc(f.front)}.${City.rep(run, f.region) ? ` <span ${tip(`Your standing with ${REGIONS[f.region].name}`)}>Standing <b>${City.rep(run, f.region) > 0 ? '+' : ''}${City.rep(run, f.region)}</b>.</span>` : ''}${seen ? ` <span class="mute">Word is: ${esc(f.dark.toLowerCase())}.</span>` : ''}</p>${roster}${habits}
    <div class="trow"><button class="btn" onclick="openDossier('${f.region}')" ${tip(`Everything you know about ${REGIONS[f.region].name}`)}>Dossier</button>${
      free
        ? `<button class="btn ${j.ok ? 'hot' : ''}" onclick="joinClub(${ti})" ${j.ok ? '' : `disabled ${tip('Missing: ' + j.why.join(', '))}`}>Sign</button><span class="small ${j.ok ? '' : 'mute'}">${esc(World.joinText(ti, run))}</span>`
        : ''
    }${ti !== run.team ? `<button class="btn" onclick="mapScout(${ti})" ${late ? `disabled ${tip(late)}` : tip(`A day at their HQ${sc > 1 ? ' (+ the trip)' : ''}: see their roster and elements, hear a rumour. −${SCOUT_STA} stamina`)}>${seen ? 'Scout again' : 'Scout'}${dayTag(sc)}</button>` : ''}</div>${challengeBlock(run, ti)}</div>`;
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
}

/** Spend a day at a place (+ the trip); the week's one event may come after the first day. Never ends the week. */
function mapGo(id, mate) {
  const run = RUN;
  if (!SPOTS[id] || !City.can(run, id, mate).ok) return;
  Run.log(run, City.day(run, id, CW.hard, mate));
  mapAfter(run);
}
function mapAfter(run) {
  if (!run.rolled) {
    run.rolled = true;
    Events.roll(run);
  }
  Run.save(run);
  renderCareer();
}
function mapClash(side, sim) {
  if (side) {
    // fighting: a real match (watch it, or sim it at once)
    const fx = Cup.clash(RUN, side);
    if (!fx) return;
    if (!sim) return navigate('match', fx);
    const m = newMatch(fx.a, fx.b, false);
    while (!m.over) playRally(m);
    fx.onFinish(m);
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
    const fx = Cup.challenge(RUN, ti, r.stake);
    if (!fx) return;
    if (!sim) return navigate('match', fx);
    const m = newMatch(fx.a, fx.b, false);
    while (!m.over) playRally(m);
    fx.onFinish(m);
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
  if (RUN.event || Run.weekType(RUN) === 'cup' || Run.weekType(RUN) === 'eval') return;
  Run.endWeek(RUN);
  renderCareer();
}
