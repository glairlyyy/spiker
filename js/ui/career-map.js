// The city map: faction districts, places and club HQs (SVG, dragged / zoomed with panzoom), and the panel for the
// selected place. Day: one main action (train / rest / recreation). Evening: one optional outing, or end the week.

function citySVG(run) {
  const eve = City.slot(run) === 'eve',
    pts = poly => poly.map(p => p.join(',')).join(' '),
    d = CITY.downtown,
    floor = run.floor || {},
    pin = (id, [x, y], icon, cls, badge, title) =>
      `<g class="pin ${cls} ${CW.spot === id ? 'sel' : ''}" transform="translate(${x},${y})" data-spot="${id}" role="button" tabindex="0" aria-label="${esc(title)}"><title>${esc(title)}</title>
        <circle r="24"/><text class="ic" y="8">${icon}</text>${badge ? `<g class="bd" transform="translate(19,-19)"><circle r="11"/><text y="4">${badge}</text></g>` : ''}</g>`;
  const districts = run.teams
    .map((t, i) => {
      const [lx, ly] = CITY.label[i],
        mine = i === run.team;
      return `<polygon class="dist ${mine ? 'mine' : ''}" points="${pts(CITY.districts[i])}" style="--tc:${t.color}"/>
        <text class="dl" x="${lx}" y="${ly}" style="--tc:${t.color}">${esc(FACTIONS[i].name)}${mine ? ' · home turf' : ''}</text>`;
    })
    .join('');
  const spots = Object.entries(SPOTS)
    .filter(([id]) => id !== 'sleep') // one Home pin serves day (rest) and evening (early night)
    .map(([id, s]) => {
      const off = id === 'home' ? false : (s.slot === 'eve') !== eve,
        mates = s.train ? (floor[s.train] || []).length : 0,
        turf = s.train && City.turf(run, s.train);
      return pin(
        id,
        City.at(run, id),
        s.icon,
        `${off ? 'off' : ''} ${turf ? 'turf' : ''}`,
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
      ).replace('<circle r="24"/>', `<circle r="24" style="--tc:${t.color}"/>`);
    })
    .join('');
  return `<div class="mapinner"><svg class="city" width="${CITY.w}" height="${CITY.h}" viewBox="0 0 ${CITY.w} ${CITY.h}" role="img" aria-label="City map">
    ${districts}
    <path class="river" d="M-10,470 C180,420 260,360 420,380 S700,280 1010,250"/>
    <ellipse class="down" cx="${d.x}" cy="${d.y}" rx="${d.rx}" ry="${d.ry}"/><text class="dl dt" x="${d.x}" y="${d.y + d.ry - 12}">Downtown</text>
    ${hqs}${spots}</svg></div>`;
}

/** The panel for the selected place: what it does and its buttons. */
function spotPanel(run, id) {
  if (!id) return `<p class="small mute">Pick a place on the map.</p>`;
  if (id.startsWith('hq')) return hqPanel(run, +id.slice(2));
  const eve = City.slot(run) === 'eve',
    sid = id === 'home' && eve ? 'sleep' : id,
    s = SPOTS[sid],
    c = City.can(run, sid),
    where = s.d == null ? 'Downtown' : FACTIONS[s.d].name,
    go = (label, arg = '') =>
      `<button class="btn ${c.ok ? 'hot' : ''}" onclick="mapGo('${sid}'${arg})" ${c.ok ? '' : `disabled ${tip(c.why)}`}>${label}</button>`;
  let body = '';
  if (s.train) body = trainSpot(run, s, c);
  else if (s.act === 'ramen')
    body = `<p class="small">${esc(s.desc)} · $${s.cost}</p><div class="trow">${Run.mates(run)
      .map(
        m =>
          `<button class="btn" onclick="mapGo('ramen','${m.id}')" ${City.can(run, 'ramen', m.id).ok ? '' : 'disabled'}>${faceSVG(m, 0, 22)} ${esc(m.name)} <small class="mute">${Run.you(run).bond[m.id] || 0}</small></button>`
      )
      .join('')}</div>${c.ok || c.why === 'pick a teammate' ? '' : `<p class="small mute">${esc(c.why)}</p>`}`;
  else
    body = `<p class="small">${esc(s.desc)}${s.cost ? ` · $${s.cost}` : ''}${sid === 'home' ? ` · ${esc(HOUSING[run.housing].name)} ×${World.restMul(run)}` : ''}</p><div class="trow">${go(s.act === 'rest' ? 'Rest' : s.act === 'rec' ? 'Relax' : 'Go')}</div>`;
  return `<div class="spot"><h4>${s.icon} ${esc(s.name)} <span class="mute small">${esc(where)}</span></h4>${body}</div>`;
}

function trainSpot(run, s, c) {
  const key = s.train,
    T = Run.myTeam(run),
    hard = CW.hard && !run.injury,
    pv = Training.preview(run, key, hard),
    fmt = ([k, v]) =>
      v
        ? `+${k === 'wit' ? v.toFixed(2) : v} ${STATNAME[k]}`
        : pv.gate && k === pv.main[0]
          ? `${STATNAME[k]} at ${pv.gate} — Limit Break`
          : `${STATNAME[k]} maxed`,
    mates = pv.mates.filter(id => T.P.some(p => p.id === id)); // a teammate who has since left
  return `<div class="tline"><b class="g">${fmt(pv.main)}</b> <span class="g2">${fmt(pv.side)}</span> <span class="mute small">−${pv.sta} sta · Lv ${pv.lvl}</span>
      ${pv.fail ? `<span class="f ${pv.fail > 0.25 ? 'hi' : 'md'}">${Math.round(pv.fail * 100)}% fail</span>` : ''}
      ${pv.streak ? `<span class="stk" ${tip('Same training in a row')}>Streak +${Math.round(pv.streak * 100)}%</span>` : ''}
      ${pv.turf ? `<span class="stk" ${tip("Your club's district")}>Turf +${Math.round(pv.turf * 100)}%</span>` : ''}
      ${info(`Facility Lv ${pv.lvl}${pv.next != null ? ` — ${pv.next} more sessions to Lv ${pv.lvl + 1}` : ' (max)'}. Stats stop at 80 and 90 until you pass a Limit Break trial. Teammates here: +20% each (+50% at bond 80+). Below 50 stamina training can fail — below ${TRAIN_X.injuryAt} it can injure you.`)}</div>
    <div class="trow"><span class="fl">${mates
      .map(id =>
        faceSVG(
          T.P.find(p => p.id === id),
          0.3,
          24
        )
      )
      .join('')}</span>
      <label class="hardt ${run.injury ? 'dis' : ''}" ${tip(`×${TRAIN_X.hard.gain} gains, skill pts ×1.5, ×${TRAIN_X.hard.sta} stamina, +${Math.round(TRAIN_X.hard.fail * 100)}% fail`)}><input type="checkbox" ${hard ? 'checked' : ''} ${run.injury ? 'disabled' : ''} onchange="CW.hard=this.checked;mapPick(CW.spot)"> Hard</label>
      <button class="btn ${c.ok ? 'hot' : ''}" onclick="mapGo('${City.spotOf(key)}')" ${c.ok ? '' : `disabled ${tip(c.why)}`}>Train ${TRAININGS[key].name}</button></div>`;
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
  return `<div class="spot" style="--tc:${t.color}"><h4>${chip(t)}${esc(t.name)} <span class="mute small">${esc(f.name)} · rating ${t.ovr}</span></h4>
    <p class="small">${esc(f.front)}.${seen ? ` <span class="mute">Word is: ${esc(f.dark.toLowerCase())}.</span>` : ''}</p>${roster}
    <div class="trow">${
      free
        ? `<button class="btn ${j.ok ? 'hot' : ''}" onclick="joinClub(${ti})" ${j.ok ? '' : `disabled ${tip('Missing: ' + j.why.join(', '))}`}>Sign</button><span class="small ${j.ok ? '' : 'mute'}">${esc(World.joinText(ti))}</span>`
        : ''
    }${ti !== run.team ? `<button class="btn" onclick="mapScout(${ti})" ${eve && !run.event ? '' : `disabled ${tip('Evenings only')}`} ${tip(`Evening: see their roster and elements, hear a rumour. −${SCOUT_STA} stamina`)}>${seen ? 'Scout again' : 'Scout'}</button>` : ''}</div></div>`;
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
    Run.save(run);
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
function mapEndWeek() {
  if (RUN.event || City.slot(RUN) !== 'eve') return;
  Run.endWeek(RUN);
  renderCareer();
}
