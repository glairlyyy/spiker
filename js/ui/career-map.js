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
    const c = Fight.clashSite(run);
    return c ? trips(c.at, { k: 'battle', label: 'Battle' }) : [];
  }
  if (id.startsWith('pt:')) return Array.from({ length: City.travelDays(run, MapModel.ptOf(id)) }, () => ({ k: 'trip', label: 'Trip' }));
  if (!SPOTS[id]) return [];
  return trips(City.at(run, id), City.dayWhat(id));
}
/** The floating card for the selected place. */
function spotCard(run) {
  return `<button class="btn x" onclick="mapPick(null)" aria-label="Close">✕</button>${spotPanel(run, CW.spot)}`;
}
/**
 * The place popup follows its pin (spec §10.1c): beside the selected pin (or the picked-point flag), right of it when it
 * fits, else left; vertically centred on it; kept inside the map area (right of the rail, under the top bar). No pin on
 * screen → the top-right corner. One rAF loop for the page; it only measures while a popup is open.
 */
const SPOT_GAP = 24;
function spotFollow() {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(spotFollow);
  try {
    spotPlace();
  } catch (e) {
    /* a frame mid-render: try again next frame */
  }
}
/** Place the open popup beside its pin now. */
function spotPlace() {
  const card = document.querySelector('.hub .spotcard.open'),
    hub = card && card.closest('.hub');
  if (card && hub) {
    const pin = hub.querySelector(CW.spot && CW.spot.startsWith('pt:') ? '.maplay .mflag' : '.maplay .mpin.sel'),
      H = hub.getBoundingClientRect(),
      cs = getComputedStyle(hub),
      L = H.left + (parseFloat(cs.getPropertyValue('--rail')) || 0) + 16,
      T = H.top + (parseFloat(cs.getPropertyValue('--tbar')) || 0) + 16,
      R = H.right - 16,
      B = H.bottom - 16,
      w = card.offsetWidth,
      h = card.offsetHeight,
      p = pin && pin.style.display !== 'none' ? pin.getBoundingClientRect() : null;
    if (p && p.width) {
      const ax = p.left + p.width / 2,
        ay = p.top + p.height / 2;
      let x = ax + SPOT_GAP;
      if (x + w > R) x = ax - SPOT_GAP - w; // flip to the left of the pin
      x = Math.max(L, Math.min(x, R - w));
      const y = Math.max(T, Math.min(ay - h / 2, B - h));
      card.style.left = `${Math.round(x - H.left)}px`;
      card.style.top = `${Math.round(y - H.top)}px`;
      card.style.right = 'auto';
      card.style.setProperty('--mv-origin', x < ax ? 'right center' : 'left center'); // it grows from its pin's side
      card.classList.add('pinned');
    } else if (card.classList.contains('pinned')) {
      card.style.left = card.style.top = card.style.right = '';
      card.classList.remove('pinned');
    }
  }
}
if (typeof requestAnimationFrame === 'function' && typeof document !== 'undefined') requestAnimationFrame(spotFollow);
function mapPick(id) {
  const prev = CW.spot,
    el = $('#spot');
  CW.spot = id;
  if (!el) return renderCareer();
  const hub = el.closest('.hub'),
    shown = el.classList.contains('open');
  // motion (spec §9.12): open grows from the pin, another pin glides + cross-fades, close leaves
  if (shown && !id && hub) Motion.leave(el, hub);
  el.innerHTML = id ? spotCard(RUN) : '';
  el.classList.toggle('open', !!id);
  MapView.select(id);
  spotPlace();
  if (id && !shown) Motion.play(el, 'in');
  else if (id && prev !== id) spotSwap(el);
  if (CW.mv) CW.mv.spot = id;
  const wk = document.querySelector('.wweek'); // ghost slots follow the selection
  if (wk) {
    const old = [...wk.querySelectorAll('#wdays .dslot')].map(e =>
      e.classList.contains('done') ? 'done' : e.classList.contains('ghost') ? 'ghost' : 'free'
    );
    wk.outerHTML = weekSection(RUN);
    dayMotion(document, old);
  }
}
/** The popup moves to another pin: it glides there (ease-move) while its content cross-fades. */
function spotSwap(el) {
  if (!el || Motion.reduced) return;
  el.classList.add('glide');
  Motion.play(el, 'swap');
  clearTimeout(el._glide);
  el._glide = setTimeout(() => el.classList.remove('glide'), 260);
}

/** Spend a day at a place (+ the trip); the week's one event may come after the first day. Never ends the week. */
function mapGo(id, mate) {
  const run = RUN;
  if (!SPOTS[id] || !City.can(run, id, mate).ok || CW.lock) return;
  const s = SPOTS[id],
    before = s.train ? trainSnap(run, TRAININGS[s.train].main[0]) : null,
    line = City.day(run, id, CW.hard, mate);
  Run.log(run, line);
  const fx = s.train ? trainFx(run, s, before, line) : null;
  mapAfter(run, fx);
}
/** After an action on the map: rules, save, render — then the action lock while you walk there (and a training cut-in). */
function mapAfter(run, fx = null) {
  Run.save(run);
  actLock(fx);
  renderCareer();
}

// ---- action lock and training cut-in (owner, 2026-10-03) -----------------------------------------------------------
// While your player walks to the place the camera stays on them and nothing on the hub takes input (a transparent layer
// with a "Walking to …" pill); on arrival a training day shows a cut-in: a spinner, then Training complete / failed with
// what changed. Display only: the rules ran before the walk began.
/** What a training day can change, for the cut-in's before / after. */
function trainSnap(run, main) {
  const you = Run.you(run),
    pr = Training.progress(run, main);
  return {
    main,
    st: Object.fromEntries([...STATK, 'wit'].map(k => [k, you[k]])),
    fans: run.fans,
    staMax: run.staMax,
    sta: run.sta,
    sp: run.sp,
    mood: run.mood,
    money: run.money,
    pct: pr.have / Math.max(1, pr.need),
    injury: !!run.injury
  };
}
/** The cut-in's content: outcome, title and the changes as rows (stat points, EXP toward the next point, costs). */
function trainFx(run, s, a, line) {
  const b = trainSnap(run, a.main),
    rows = [],
    ok = !/ failed/.test(line);
  for (const k of [...STATK, 'wit']) {
    const d = +(b.st[k] - a.st[k]).toFixed(2);
    if (d) rows.push([statI(statKey(k), 18), STATNAME[k], fmtDelta(k === 'wit' ? +d.toFixed(2) : d), d > 0 ? 'up' : 'dn']);
  }
  if (ok && b.st[a.main] === a.st[a.main] && b.pct > a.pct)
    rows.push([
      statI(statKey(a.main), 18),
      `${STATNAME[a.main]} EXP`,
      `+${Math.round((b.pct - a.pct) * 100)}%`,
      'up',
      `${Math.round(b.pct * 100)}% to the next point`
    ]);
  if (b.sp !== a.sp) rows.push([statI('sp', 18), 'Skill pts', fmtDelta(b.sp - a.sp), b.sp > a.sp ? 'up' : 'dn']);
  if (b.sta !== a.sta) rows.push([statI('sta', 18), 'Stamina', fmtDelta(b.sta - a.sta), 'cost']);
  if (b.money !== a.money) rows.push([statI('mon', 18), 'Money', fmtDelta(b.money - a.money, { pre: '$' }), 'cost']);
  if (b.mood !== a.mood) rows.push([statI('mood', 18), 'Mood', b.mood > a.mood ? '↑' : '↓', b.mood > a.mood ? 'up' : 'dn']);
  return { ok, injured: b.injury && !a.injury, name: TRAININGS[s.train].name, place: s.name, rows, was: a };
}
const LOCK = { min: 250, max: 20000, spin: 1100, show: 3200 }; // ms: wait for the walk to start · give up · spinner · result
/** Lock the hub until your player arrives; then the training cut-in (if any), then unlock. */
function actLock(fx) {
  const t0 = Date.now(),
    L = (CW.lock = { phase: 'walk', fx, to: CW.spot && SPOTS[CW.spot] ? SPOTS[CW.spot].name : '' });
  clearInterval(actLock.iv);
  actLock.iv = setInterval(() => {
    if (CW.lock !== L) return clearInterval(actLock.iv);
    const t = Date.now() - t0;
    if (L.phase === 'walk' && t > LOCK.min && (!MapView.busy() || t > LOCK.max)) {
      clearInterval(actLock.iv);
      if (!fx) return lockEnd();
      lockPhase('spin');
      setTimeout(() => CW.lock === L && lockPhase('done'), LOCK.spin);
      setTimeout(() => CW.lock === L && L.phase === 'done' && lockEnd(), LOCK.spin + LOCK.show);
    }
  }, 120);
}
/** Show a lock phase: in place while the spinner runs; the result re-renders the hub so the top bar and rail catch up (with their deltas). */
function lockPhase(p) {
  CW.lock.phase = p;
  if (p === 'done' && CW.lock.fx && CW.lock.fx.was) return renderCareer();
  const el = $('#actlock');
  if (el) el.outerHTML = lockLayer();
}
function lockEnd() {
  CW.lock = null;
  const el = $('#actlock');
  if (el) el.remove();
}
/** The run as the top bar and rail show it: before a training day's changes until its result card (then the real run). */
function lockShown(run) {
  const L = CW.lock,
    w = L && L.phase !== 'done' && L.fx && L.fx.was;
  return w ? { ...run, money: w.money, fans: w.fans, sp: w.sp, sta: w.sta, staMax: w.staMax, mood: w.mood, st: w.st } : run;
}
/** The lock layer: transparent while walking (a pill says where to), dimmed with the cut-in card for a training day. */
function lockLayer() {
  const L = CW.lock;
  if (!L) return '';
  if (L.phase === 'walk')
    return `<div class="actlock walk" id="actlock" role="status" aria-live="polite"><span class="lkpill"><i class="spin sm" aria-hidden="true"></i>${L.to ? `Walking to ${esc(L.to)}` : 'On the way'}</span></div>`;
  const F = L.fx;
  if (L.phase === 'spin')
    return `<div class="actlock dim" id="actlock" role="status" aria-live="polite"><div class="tfx"><i class="spin" aria-hidden="true"></i><b>${esc(F.name)} training</b><small class="mute">${esc(F.place)}</small></div></div>`;
  return `<div class="actlock dim" id="actlock" role="status" aria-live="polite" onclick="lockEnd()"><div class="tfx ${F.ok ? 'ok' : 'bad'}">
    <span class="tfi" aria-hidden="true">${F.ok ? '✓' : '✕'}</span><b>${F.ok ? 'Training complete' : F.injured ? 'Training failed — injured' : 'Training failed'}</b>
    ${F.rows.length ? `<div class="tfr">${F.rows.map(([ic, n, v, c, t]) => `<div ${t ? tip(t) : ''}>${ic}<span>${n}</span><b class="${c}">${v}</b></div>`).join('')}</div>` : ''}
    <small class="mute">Click or press Space</small></div></div>`;
}
function mapClash(side, sim) {
  if (side) {
    // fighting: a real match (watch it, or sim it at once)
    const fx = Fight.clash(RUN, side);
    if (!fx) return;
    if (!sim) return watchCareer(fx);
    Cup.simNow(fx);
  } else {
    const line = Fight.watch(RUN, null);
    if (!line) return;
    Run.log(RUN, line);
  }
  CW.spot = null;
  mapAfter(RUN);
}
/** Step the stake of a challenge to club ti. */
function mapStake(ti, d) {
  const S = (CW.stake = CW.stake || {});
  S[ti] = clamp((S[ti] || 0) + d * CHALLENGE.stakeStep, 0, Fight.stakeMax(RUN));
  mapPick(`hq${ti}`);
}
/** Challenge club ti at the chosen stake: refused (diary line) or played (watch, or sim = the result at once). */
function mapChallenge(ti, sim) {
  const r = Fight.offer(RUN, ti, (CW.stake || {})[ti] || 0);
  if (!r) return;
  CW.spot = `hq${ti}`;
  if (r.accepted) {
    const fx = Fight.challenge(RUN, ti, r.stake);
    if (!fx) return;
    if (!sim) return watchCareer(fx);
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
  if (CW.lock) return;
  const line = City.travelTo(RUN, [x, y]);
  if (!line) return;
  Run.log(RUN, line);
  if (CW.spot && CW.spot.startsWith('pt:')) CW.spot = null;
  Run.save(RUN);
  actLock(null);
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
