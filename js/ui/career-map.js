// The island map: regions, places and club HQs (SVG, dragged / zoomed with panzoom), and the panel for the
// selected place. Day: one main action (train / rest / recreation). Evening: one optional outing, or end the week.

function citySVG(run) {
  const eve = City.slot(run) === 'eve',
    pts = poly => poly.map(p => p.join(',')).join(' '),
    path = poly => 'M' + poly.map(p => p.join(',')).join('L') + 'Z',
    floor = run.floor || {},
    mine = City.myRegion(run),
    pin = (id, [x, y], icon, cls, badge, title) =>
      `<g class="pin ${cls} ${CW.spot === id ? 'sel' : ''}" transform="translate(${x},${y})" data-spot="${id}" role="button" tabindex="0" aria-label="${esc(title)}"><title>${esc(title)}</title>
        <circle r="22"/><text class="ic" y="7">${icon}</text>${badge ? `<g class="bd" transform="translate(17,-17)"><circle r="10"/><text y="4">${badge}</text></g>` : ''}</g>`;
  const col = r => (r === 'wei' ? '#f5b82e' : r === 'wu' ? '#3fa9f5' : r === 'shu' ? '#4ade80' : r === 'outlaws' ? '#ff8c42' : '#ff5da2'),
    lab = (r, big) => {
      const [x, y] = CITY.label[r];
      return `<text class="rl ${big ? 'big' : ''}" x="${x}" y="${y}" style="--tc:${col(r)}">${esc(REGIONS[r].name)}${r === mine ? ' · home turf' : ''}</text>`;
    };
  const land = `
    <path class="island" d="${path(CITY.coast)}"/>
    <path class="reg wu ${mine === 'wu' ? 'mine' : ''}" style="--tc:${col('wu')}" fill-rule="evenodd" d="${path(CITY.coast)} ${path(CITY.inner)}"/>
    <polygon class="reg ${mine === 'shu' ? 'mine' : ''}" style="--tc:${col('shu')}" points="${pts(CITY.shu)}"/>
    ${CITY.mountains.map(([x, y]) => `<path class="mtn" d="M${x - 22},${y + 12} L${x},${y - 16} L${x + 22},${y + 12}Z"/>`).join('')}
    <polygon class="reg ${mine === 'wei' ? 'mine' : ''}" style="--tc:${col('wei')}" points="${pts(CITY.wei)}"/>
    <polyline class="contest" points="${pts(CITY.wei.slice(1, 5))}"><title>Contested Wei–Wu border</title></polyline>
    ${Object.entries(CITY.minors)
      .map(
        ([r, e]) =>
          `<ellipse class="minor ${mine === r ? 'mine' : ''}" style="--tc:${col(r)}" cx="${e.x}" cy="${e.y}" rx="${e.rx}" ry="${e.ry}" transform="rotate(${e.rot} ${e.x} ${e.y})"/>`
      )
      .join('')}
    ${lab('wei', 1)}${lab('shu', 1)}${lab('wu', 1)}${lab('outlaws')}${lab('gloria')}
    <g class="airport" transform="translate(${CITY.airport.join(',')})"><text class="ic" y="6">✈</text><text class="ap" y="30">Airport</text></g>`;
  const spots = Object.entries(SPOTS)
    .filter(([id]) => id !== 'sleep') // one Home pin serves day (rest) and evening (early night)
    .map(([id, s]) => {
      const off = id === 'home' ? false : (s.slot === 'eve') !== eve,
        mates = s.train ? (floor[s.train] || []).length : 0,
        Q = s.train ? City.quality(run, id) : null;
      const trip = City.travel(run, City.region(run, id));
      return pin(
        id,
        City.at(run, id),
        s.icon,
        `${off ? 'off' : ''} ${trip >= 2 ? 'faraway' : ''} ${s.train && City.turf(run, id) ? 'turf' : ''} ${Q && Q.known && Q.tag ? Q.tag : ''}`,
        mates || '',
        `${s.name}${s.train ? ` — ${TRAININGS[s.train].name} training` : ''}`
      );
    })
    .join('');
  const hqs = run.teams
    .map((t, i) => {
      const c = World.isFree(run) && World.canJoin(run, i).ok;
      return pin(
        `hq${i}`,
        CITY.hq[i],
        '🛡',
        `hq ${c ? 'can' : ''} ${i === run.team ? 'mine' : ''}`,
        c ? '✓' : City.scouted(run, i) ? '👁' : '',
        `${t.name} HQ`
      ).replace('<circle r="22"/>', `<circle r="22" style="--tc:${t.color}"/>`);
    })
    .join('');
  const here = REGIONS[City.loc(run)],
    you = `<g class="here" transform="translate(${here.at.join(',')})"><circle r="30"/><text y="5">YOU</text><title>You are in ${esc(here.name)}</title></g>`;
  return `<div class="mapinner"><svg class="city" width="${CITY.w}" height="${CITY.h}" viewBox="0 0 ${CITY.w} ${CITY.h}" role="img" aria-label="Island map">
    ${land}${you}${hqs}${spots}</svg></div>`;
}

/** The panel for the selected place: what it does and its buttons. */
function spotPanel(run, id) {
  if (!id) return `<p class="small mute">Pick a place on the map.</p>`;
  if (id.startsWith('hq')) return hqPanel(run, +id.slice(2));
  const eve = City.slot(run) === 'eve',
    sid = id === 'home' && eve ? 'sleep' : id,
    s = SPOTS[sid],
    c = City.can(run, sid),
    reg = REGIONS[City.region(run, sid)] || REGIONS.open,
    cost = City.price(run, sid),
    trip = City.travel(run, City.region(run, sid)),
    go = (label, arg = '') =>
      `<button class="btn ${c.ok ? 'hot' : ''}" onclick="mapGo('${sid}'${arg})" ${c.ok ? '' : `disabled ${tip(c.why)}`}>${label}</button>`;
  let body = '';
  if (s.train) body = trainSpot(run, sid, c);
  else if (s.act === 'ramen')
    body = `<p class="small">${esc(s.desc)} · $${cost}</p><div class="trow">${Run.mates(run)
      .map(
        m =>
          `<button class="btn" onclick="mapGo('${sid}','${m.id}')" ${City.can(run, sid, m.id).ok ? '' : 'disabled'}>${faceSVG(m, 0, 22)} ${esc(m.name)} <small class="mute">${Run.you(run).bond[m.id] || 0}</small></button>`
      )
      .join('')}</div>${c.ok || c.why === 'pick a teammate' ? '' : `<p class="small mute">${esc(c.why)}</p>`}`;
  else
    body = `<p class="small">${esc(s.desc)}${cost ? ` · $${cost}` : ''}${sid === 'home' ? ` · ${esc(HOUSING[run.housing].name)} ×${World.restMul(run)}` : ''}</p><div class="trow">${go(s.act === 'rest' ? 'Rest' : s.act === 'rec' ? 'Relax' : 'Go')}</div>`;
  return `<div class="spot"><h4>${s.icon} ${esc(s.name)} <span class="mute small" ${tip(reg.desc)}>${esc(reg.name)}</span>${
    trip === 1 && !eve
      ? ` <span class="stk" ${tip('Getting there takes the evening: no outing afterwards')}>Trip: evening</span>`
      : trip >= 2
        ? ` <span class="stk far" ${tip('Far away: travelling there takes a whole day')}>Far</span>`
        : ''
  }</h4>${body}${c.travel && !eve ? `<div class="trow"><button class="btn" onclick="mapTravel('${City.region(run, sid)}')">Travel to ${esc(reg.name)} (takes the day)</button></div>` : ''}</div>`;
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
      if (pv.gate && k === pv.main[0]) return `${STATNAME[k]} at ${pv.gate} — Limit Break`;
      // how much this session moves the stat, compared with what its next point costs at your level
      const r = xp / Training.progress(run, k).need,
        g = r >= 2.5 ? ['High', 'hi'] : r >= 1 ? ['Mid', 'md'] : ['Low', 'lo'];
      return `${STATNAME[k]} <span class="gl ${g[1]}">${g[0]}</span>`;
    },
    mates = pv.mates.filter(pid => T.P.some(p => p.id === pid)); // a teammate who has since left
  return `<div class="tline">${qualityTag(run, id)} <b class="g">${fmt(pv.main)}</b> <span class="g2">${fmt(pv.side)}</span> <span class="mute small">−${pv.sta} sta · $${City.price(run, id)} · Lv ${pv.lvl}</span>
      ${pv.fail ? `<span class="f ${pv.fail > 0.25 ? 'hi' : 'md'}">${Math.round(pv.fail * 100)}% fail</span>` : ''}
      ${pv.streak ? `<span class="stk" ${tip('Same training in a row')}>Streak +${Math.round(pv.streak * 100)}%</span>` : ''}
      ${turf ? `<span class="stk" ${tip("Your faction's region")}>Turf +${Math.round(turf * 100)}%</span>` : ''}
      ${s.sand ? `<span class="stk" ${tip(`Sand training builds technique: skill points ×${SAND_SP}`)}>Sand ×${SAND_SP} pts</span>` : ''}
      ${info(`Facility Lv ${pv.lvl}${pv.next != null ? ` — ${pv.next} more sessions to Lv ${pv.lvl + 1}` : ' (max)'}. Stats stop at 80 and 90 until you pass a Limit Break trial. Teammates here: +20% each (+50% at bond 80+). Below 50 stamina training can fail — below ${TRAIN_X.injuryAt} it can injure you.`)}</div>
    <div class="trow"><span class="fl">${mates
      .map(pid =>
        faceSVG(
          T.P.find(p => p.id === pid),
          0.3,
          24
        )
      )
      .join('')}</span>
      <label class="hardt ${run.injury ? 'dis' : ''}" ${tip(`×${TRAIN_X.hard.gain} gains, skill pts ×1.5, ×${TRAIN_X.hard.sta} stamina, +${Math.round(TRAIN_X.hard.fail * 100)}% fail`)}><input type="checkbox" ${hard ? 'checked' : ''} ${run.injury ? 'disabled' : ''} onchange="CW.hard=this.checked;mapPick(CW.spot)"> Hard</label>
      <button class="btn ${c.ok ? 'hot' : ''}" onclick="mapGo('${id}')" ${c.ok ? '' : `disabled ${tip(c.why)}`}>Train ${TRAININGS[key].name}</button></div>`;
}

function hqPanel(run, ti) {
  const t = run.teams[ti],
    f = FACTIONS[ti],
    free = World.isFree(run),
    j = World.canJoin(run, ti),
    eve = City.slot(run) === 'eve',
    seen = City.scouted(run, ti);
  const roster = seen
    ? `<div class="roster small">${t.P.map(p => `<span>${faceSVG(p, 0, 22)}${stag(p)}${esc(p.name)} <i class="mute">${p.role} ${ovr(p)}</i>${p.elOn ? ` <b style="color:${ECOL[p.el]}">${ENAME[p.el]}</b>` : ''}</span>`).join('')}</div>`
    : '';
  return `<div class="spot" style="--tc:${t.color}"><h4>${chip(t)}${esc(t.name)} <span class="mute small">${esc(REGIONS[f.region].name)} · rating ${t.ovr}</span></h4>
    <p class="small">${esc(f.front)}.${seen ? ` <span class="mute">Word is: ${esc(f.dark.toLowerCase())}.</span>` : ''}</p>${roster}
    <div class="trow">${
      free
        ? `<button class="btn ${j.ok ? 'hot' : ''}" onclick="joinClub(${ti})" ${j.ok ? '' : `disabled ${tip('Missing: ' + j.why.join(', '))}`}>Sign</button><span class="small ${j.ok ? '' : 'mute'}">${esc(World.joinText(ti))}</span>`
        : ''
    }${ti !== run.team ? `<button class="btn" onclick="mapScout(${ti})" ${eve && !run.event && !City.farTo(run, f.region) ? '' : `disabled ${tip(City.farTo(run, f.region) ? 'Scout where you are: travel there first' : 'Evenings only')}`} ${tip(`Evening: see their roster and elements, hear a rumour. −${SCOUT_STA} stamina`)}>${seen ? 'Scout again' : 'Scout'}</button>` : ''}</div></div>`;
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
  for (const g of document.querySelectorAll('.city .pin')) g.classList.toggle('sel', g.dataset.spot === id);
}

let PZ = null; // the map's panzoom instance
const PAD = 90; // px the map may be dragged past the screen edge, so edge labels can clear the HUD
/** Make the map draggable / zoomable: it covers the screen (a little overscroll, PAD) (zoom 1× – 2.5× of "cover"), keeps its view across re-renders. */
function mapInit() {
  const wrap = $('#mapwrap'),
    inner = wrap && wrap.querySelector('.mapinner');
  if (PZ) PZ.dispose();
  PZ = null;
  if (!inner || typeof panzoom !== 'function') return;
  const W = CITY.w,
    H = CITY.h,
    size = () => [wrap.clientWidth, wrap.clientHeight],
    [cw, ch] = size(),
    fit = Math.max(cw / W, ch / H);
  const pz = panzoom(inner, { minZoom: fit, maxZoom: fit * 2.5, zoomDoubleClickSpeed: 1, onTouch: () => false });
  const keepIn = () => {
    const t = pz.getTransform(),
      [cw, ch] = size(),
      w = W * t.scale,
      h = H * t.scale;
    t.x = w <= cw ? (cw - w) / 2 : clamp(t.x, cw - w - PAD, PAD);
    t.y = h <= ch ? (ch - h) / 2 : clamp(t.y, ch - h - PAD, PAD);
  };
  pz.on('pan', keepIn);
  pz.on('zoom', keepIn);
  pz.on('panend', () => (CW.panEnd = Date.now()));
  pz.on('transform', () => {
    const t = pz.getTransform();
    CW.view = { x: t.x, y: t.y, s: t.scale, fit };
  });
  const v = CW.view && CW.view.fit === fit ? CW.view : null;
  if (v) {
    pz.zoomAbs(0, 0, v.s);
    pz.moveTo(v.x, v.y);
  } else {
    // start centred on where you live
    const [hx, hy] = City.at(RUN, 'home');
    pz.zoomAbs(0, 0, fit);
    pz.moveTo(cw / 2 - hx * fit, ch / 2 - hy * fit);
  }
  const hit = e => e.target.closest && e.target.closest('[data-spot]');
  inner.addEventListener('click', e => {
    const g = hit(e);
    if (g && Date.now() - (CW.panEnd || 0) > 200) mapPick(g.dataset.spot);
  });
  inner.addEventListener('keydown', e => {
    const g = hit(e);
    if (g && e.key === 'Enter') mapPick(g.dataset.spot);
  });
  PZ = pz;
}
window.addEventListener('resize', () => {
  if (G.view === 'career' && $('#mapwrap')) mapInit();
});
/** Act at a place: the day action (then maybe an event, then the evening) or the evening outing (ends the week). */
function mapGo(id, mate) {
  const run = RUN,
    s = SPOTS[id];
  if (!s || !City.can(run, id, mate).ok) return;
  if (s.slot === 'day') {
    Run.log(run, City.day(run, id, CW.hard));
    Events.roll(run);
    if (run.slot === 'done' && !run.event)
      Run.endWeek(run); // a long trip: no evening
    else Run.save(run);
  } else {
    Run.log(run, City.evening(run, id, mate));
    Run.endWeek(run);
  }
  renderCareer();
}
function mapScout(ti) {
  const line = City.scout(RUN, ti);
  if (!line) return;
  Run.log(RUN, line);
  Run.endWeek(RUN);
  CW.spot = `hq${ti}`;
  renderCareer();
}
/** The week's day action: travel to another region (you arrive with the evening free). */
function mapTravel(r) {
  const line = City.travelTo(RUN, r);
  if (!line) return;
  Run.log(RUN, line);
  Run.save(RUN);
  renderCareer();
}
function mapEndWeek() {
  if (RUN.event || City.slot(RUN) !== 'eve') return;
  Run.endWeek(RUN);
  renderCareer();
}
