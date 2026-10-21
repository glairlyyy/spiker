// The island map's UI: mounting the renderer (MapView, js/ui/map-view.js) with the model (MapModel), the panel for the
// selected place, and the actions behind its buttons. A week has 7 days: every action takes a day plus the trip there (by distance); the player ends the
// week. The map is dark where you haven't been: places show once explored; click any land to travel there.

/** Draw the map for this run (MapView = the renderer; MapModel = what to draw). */
function mapMount(run) {
  const el = $('#mapwrap');
  if (!el) return;
  roadMod();
  roadSync(run);
  MapView.mount(el, MapModel.build(run, CW.spot), { pick: mapPick, point: mapPoint });
  if (typeof Ambience !== 'undefined') Ambience.start(); // the island's sound (spec §4.37 5): only while the map is up
}
/** Empty map clicked: land → a point to travel to; sea → deselect. */
function mapPoint(p) {
  if (!City.onLand(p)) return mapPick(null);
  CW.spot = MapModel.ptId(p);
  if (Story.pick(RUN, CW.spot)) Run.save(RUN); // Fern's lesson for the first tile you click (spec §10.10a)
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
/** The floating card for the selected place (with the route choice when a short cut exists — spec §4.37 4). */
function spotCard(run) {
  roadSync(run);
  const body = spotPanel(run, CW.spot),
    row = routeRow(run);
  return `<button class="btn x" onclick="mapPick(null)" aria-label="Close">✕</button>${row ? body.replace(/<\/div>\s*$/, `${row}</div>`) : body}`;
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
  roadSync(RUN);
  if (id && Story.pick(RUN, id)) {
    Run.save(RUN);
    return renderCareer(); // Fern's lesson for the first place of its kind you click (spec §10.10a); its card waits behind
  }
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
    oid = City.orderOf(id, mate), // a day order (spec §4.33): a kit place's (its lead drill by default) or Stretch at home / the grounds
    before = oid ? trainSnap(run, DAY_ORDERS[oid].main[0]) : null,
    via = roadStart(City.at(run, id)),
    line = City.day(run, id, CW.hard, mate);
  Run.log(run, line);
  const fx = oid ? trainFx(run, s, before, line, oid) : null;
  if (fx) fx.redo = () => trainFx(run, s, before, line, oid); // the focus press re-reads the day (spec §4.37 4)
  mapAfter(run, fx, null, roadAfter(run, via));
}
/** Stretch at map point (x, y) (spec §4.33: anywhere): the trip + a day there. */
function mapStretch(x, y) {
  const run = RUN;
  if (CW.lock || !City.pointCan(run, [x, y]).ok) return;
  const before = trainSnap(run, DAY_ORDERS.stretch.main[0]),
    via = roadStart([x, y]),
    line = City.pointDay(run, [x, y]);
  if (!line) return;
  Run.log(run, line);
  CW.spot = null;
  const s = { name: REGIONS[City.loc(run)].name },
    fx = trainFx(run, s, before, line, 'stretch');
  fx.redo = () => trainFx(run, s, before, line, 'stretch');
  mapAfter(run, fx, null, roadAfter(run, via));
}
/** After an action on the map: rules, save, render — then the action lock while you walk there (and a training cut-in). */
function mapAfter(run, fx = null, res = null, enc = null) {
  Run.save(run);
  actLock(fx, null, res, enc);
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
    st: Object.fromEntries([...STATK, 'wit'].map(k => [k, you[k]]).concat(BODY.keys.map(k => [k, Training.level(you, k)]))), // court skills + the body (spec §4.33)
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
function trainFx(run, s, a, line, oid) {
  const b = trainSnap(run, a.main),
    rows = [],
    ok = !/ failed/.test(line);
  const ic = k => (BODY.glyph[k] ? `<i class="bgl" aria-hidden="true">${BODY.glyph[k]}</i>` : statI(statKey(k), 18));
  for (const k of [...BODY.keys, ...STATK, 'wit']) {
    const d = +(b.st[k] - a.st[k]).toFixed(2);
    if (d) rows.push([ic(k), Body.name(k), fmtDelta(k === 'wit' ? +d.toFixed(2) : d), d > 0 ? 'up' : 'dn']);
  }
  if (ok && b.st[a.main] === a.st[a.main] && b.pct > a.pct)
    rows.push([
      ic(a.main),
      `${Body.name(a.main)} EXP`,
      `+${Math.round((b.pct - a.pct) * 100)}%`,
      'up',
      `${Math.round(b.pct * 100)}% to the next point`
    ]);
  if (b.sp !== a.sp) rows.push([statI('sp', 18), 'Skill pts', fmtDelta(b.sp - a.sp), b.sp > a.sp ? 'up' : 'dn']);
  if (b.sta !== a.sta) rows.push([statI('sta', 18), 'Stamina', fmtDelta(b.sta - a.sta), 'cost']);
  if (b.money !== a.money) rows.push([statI('mon', 18), 'Money', fmtDelta(b.money - a.money, { pre: '$' }), 'cost']);
  if (b.mood !== a.mood) rows.push([statI('mood', 18), 'Mood', b.mood > a.mood ? '↑' : '↓', b.mood > a.mood ? 'up' : 'dn']);
  return { ok, injured: b.injury && !a.injury, name: oid ? DAY_ORDERS[oid].name : TRAININGS[s.train].name, place: s.name, rows, was: a };
}
const LOCK = { min: 250, max: 20000, spin: 1100, show: 3200 }; // ms: wait for the walk to start · give up · spinner · result
/**
 * Lock the hub until your player arrives; then a greeting (training with a friend: their line in the dialogue box, owner
 * 2026-10-05), then the training cut-in (if any), then unlock. greet = { person, text } or null.
 */
function actLock(fx, greet = null, res = null, enc = null) {
  const L = (CW.lock = { phase: 'walk', fx, greet, res, enc, to: CW.spot && SPOTS[CW.spot] ? SPOTS[CW.spot].name : '' });
  lockWalk(L);
}
/**
 * Wait for the walk: an encounter on the road (L.enc, spec §4.37 3) opens its card where the avatar halts (WALK.held) — or on arrival
 * when the map can't stop it; then the friend's greeting, the cut-in or the result.
 */
function lockWalk(L) {
  const t0 = Date.now(),
    W = ROAD.mod && ROAD.mod.WALK;
  clearInterval(actLock.iv);
  if (W) W.onHold = () => CW.lock === L && L.phase === 'walk' && L.enc && lockPhase('enc');
  actLock.iv = setInterval(() => {
    if (CW.lock !== L) return clearInterval(actLock.iv);
    if (L.phase !== 'walk') return;
    const t = Date.now() - t0;
    if (W && W.held) return L.enc ? lockPhase('enc') : W.go(); // (a stop with nothing to show: walk on)
    if (t > LOCK.min && (!MapView.busy() || t > LOCK.max)) {
      if (L.enc) return lockPhase('enc'); // no stop on the way (no 3D map, a short walk): it meets you on arrival
      clearInterval(actLock.iv);
      if (L.greet) return lockPhase('greet'); // Space / click moves on to the cut-in
      lockTrain(L);
    }
  }, 120);
}
/** The training cut-in: spinner (with the focus press on an order day — spec §4.37 4), then the result, then unlock (no cut-in: unlock now). */
function lockTrain(L) {
  if (L.res) return lockPhase('res'); // a simmed match: its result card, until you close it
  if (!L.fx) return lockEnd();
  const F = L.fx.ok && L.fx.redo && City.dayXp && Encounter.focusOn() ? (L.focus = { t0: Date.now(), ms: ENC.focus.ms, st: null }) : null,
    ms = F ? F.ms : LOCK.spin;
  lockPhase('spin');
  if (F) focusAnim(L);
  setTimeout(() => {
    if (CW.lock !== L) return;
    if (F && F.st == null) {
      F.st = 'skip'; // skipped: × 1, never a loss
      City.focus(RUN, false);
    }
    lockPhase('done');
  }, ms);
  setTimeout(() => CW.lock === L && L.phase === 'done' && lockEnd(), ms + LOCK.show);
}
/** The friend's greeting was read: on to the cut-in. */
function lockGreetDone() {
  if (CW.lock && CW.lock.phase === 'greet') lockTrain(CW.lock);
}
/** Show a lock phase: in place while the spinner runs; the result re-renders the hub so the top bar and rail catch up (with their deltas). */
function lockPhase(p) {
  if (!CW.lock) return;
  CW.lock.phase = p;
  if (p === 'done' && CW.lock.fx && CW.lock.fx.was) return renderCareer();
  const el = $('#actlock');
  if (el) el.outerHTML = lockLayer();
}
function lockEnd() {
  const L = CW.lock;
  CW.lock = null;
  roadClear();
  if (L && L.phase === 'res') return renderCareer(); // the hub catches up (and the match's scene, if any, may play)
  const el = $('#actlock');
  if (el) el.remove();
  if (L && typeof RUN !== 'undefined' && RUN && City.night(RUN)) renderCareer(); // the last day is spent: the End week ask
}
/**
 * Out of days (owner, 2026-10-05): once the lock ends with no days left, a card asks to end the week — never forced.
 * "I'll stay" closes it for this week (End week stays on the rail).
 */
function nightCard() {
  return `<div class="panel night"><h3>No days left</h3><p class="mute">The week is spent. End it?</p>
    <div class="acts two"><button class="btn hot" onclick="nightAnswer(true)">Yes, end the week</button><button class="btn" onclick="nightAnswer(false)">I'll stay</button></div></div>`;
}
function nightAnswer(yes) {
  CW.nightAsk = RUN.week;
  if (yes && Run.canEndWeek(RUN)) return endWeekUI();
  renderCareer();
}
/** The run as the top bar and rail show it: before a training day's changes until its result card (then the real run). */
function lockShown(run) {
  const L = CW.lock,
    w = L && L.phase !== 'done' && L.fx && L.fx.was;
  return w ? { ...run, money: w.money, fans: w.fans, sp: w.sp, sta: w.sta, staMax: w.staMax, mood: w.mood, st: w.st } : run;
}
/** The lock layer: transparent while walking (a pill says where to), dimmed with the cut-in card for a training day or the result card of a simmed match. */
function lockLayer() {
  const L = CW.lock;
  if (!L) return '';
  if (L.phase === 'walk')
    return `<div class="actlock walk" id="actlock" role="status" aria-live="polite"><span class="lkpill"><i class="spin sm" aria-hidden="true"></i>${L.to ? `Walking to ${esc(L.to)}` : 'On the way'}</span></div>`;
  if (L.phase === 'greet') {
    const P = L.greet.person;
    return `<div class="actlock greet" id="actlock" role="dialog" aria-live="polite" onclick="lockGreetDone()"><div class="sbox">${P ? `<span class="sb-face">${faceSVG(P, 0, 72)}</span>` : ''}<div class="sb-body">${P ? `<b class="sb-name">${esc(P.name)}</b>` : ''}<p class="sb-text">${esc(L.greet.text)}</p></div><span class="sb-keys"><kbd>Space</kbd> next</span></div></div>`;
  }
  if (L.phase === 'res') return `<div class="actlock dim res" id="actlock" role="dialog" aria-live="polite">${L.res}</div>`;
  if (L.phase === 'enc') return encLayer(L);
  const F = L.fx;
  if (L.phase === 'spin')
    return `<div class="actlock dim" id="actlock" role="status" aria-live="polite"><div class="tfx">${L.focus ? focusRing(L) : '<i class="spin" aria-hidden="true"></i>'}<b>${esc(F.name)}</b><small class="mute">${esc(F.place)}</small>${L.focus ? `<small id="fhint">${L.focus.st === 'hit' ? 'On the beat — EXP +10 %' : L.focus.st === 'miss' ? 'Off the beat — no change' : '<kbd>Space</kbd> on the beat → EXP +10 %'}</small>` : ''}</div></div>`;
  const rows = F.rows.concat(
    L.focus && L.focus.st === 'hit'
      ? [['<i class="bgl" aria-hidden="true">◎</i>', 'Focus', '+10 %', 'up', 'On the beat: that day’s EXP +10 %']]
      : []
  );
  return `<div class="actlock dim" id="actlock" role="status" aria-live="polite" onclick="lockEnd()"><div class="tfx ${F.ok ? 'ok' : 'bad'}">
    <span class="tfi" aria-hidden="true">${F.ok ? '✓' : '✕'}</span><b>${F.ok ? `${esc(F.name)} — done` : F.injured ? `${esc(F.name)} failed — injured` : `${esc(F.name)} failed`}</b>
    ${rows.length ? `<div class="tfr">${rows.map(([ic, n, v, c, t]) => `<div ${t ? tip(t) : ''}>${ic}<span>${n}</span><b class="${c}">${v}</b></div>`).join('')}</div>` : ''}
    <small class="mute">Click or press Space</small></div></div>`;
}
/** The Raid order (T-318): played at once; the diary line, then the hub. */
function mapRaid() {
  if (CW.lock) return;
  const line = Fight.raid(RUN);
  if (!line) return;
  Run.log(RUN, line);
  CW.spot = null;
  mapAfter(RUN);
}
function mapClash(side, sim) {
  let res = null;
  if (side) {
    // fighting: a real match (watch it, or sim it at once)
    const fx = Fight.clash(RUN, side);
    if (!fx) return;
    if (!sim) return watchCareer(fx);
    res = simCareer(fx);
  } else {
    const line = Fight.watch(RUN, null);
    if (!line) return;
    Run.log(RUN, line);
  }
  CW.spot = null;
  mapAfter(RUN, null, res);
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
  let res = null;
  if (!r) return;
  CW.spot = `hq${ti}`;
  if (r.accepted) {
    const fx = Fight.challenge(RUN, ti, r.stake);
    if (!fx) return;
    if (!sim) return watchCareer(fx);
    res = simCareer(fx);
  } else Run.log(RUN, r.line);
  mapAfter(RUN, null, res);
}
function mapScout(ti) {
  if (CW.lock) return;
  const via = roadStart(CITY.hq[ti]),
    line = City.scout(RUN, ti);
  if (!line) return;
  Run.log(RUN, line);
  CW.spot = `hq${ti}`;
  mapAfter(RUN, null, null, roadAfter(RUN, via));
}
/** Just travel to a point (its trip days, at least one); `how` 'run': run it (T-309 — the ground trains you). */
function mapTravel(x, y, how = 'walk') {
  if (CW.lock) return;
  const via = roadStart([x, y]),
    line = City.travelTo(RUN, [x, y], how);
  if (!line) return;
  Run.log(RUN, line);
  if (CW.spot && CW.spot.startsWith('pt:')) CW.spot = null;
  const enc = roadAfter(RUN, via);
  Run.save(RUN);
  actLock(null, null, null, enc);
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

// ---- the road (spec §4.37 3–4, T-333 / T-335): the short cut, the stop on the way, the focus press ------------------------
// ROAD.mod is js/map3d/avatar3d.mjs — the same module instance the map renders with — whose WALK halts your walk at an encounter
// and draws the two routes. Display only: the rules (City / Encounter) ran before the walk began.
const ROAD = { mod: null, load: null, key: '', to: null, alt: null, route: 'safe' };
/** Load the avatar module once (its WALK), and give the island sound its footsteps. */
function roadMod() {
  if (ROAD.mod || ROAD.load || typeof document === 'undefined') return;
  ROAD.load = import(new URL('js/map3d/avatar3d.mjs', document.baseURI).href)
    .then(m => {
      ROAD.mod = m;
      if (typeof Ambience !== 'undefined') Ambience.bind(m.WALK);
      if (typeof RUN !== 'undefined' && RUN && document.querySelector('.career.hub')) roadSync(RUN);
    })
    .catch(e => DBG.log('warn', 'The road (avatar module) could not load', e && e.message ? e.message : e));
}
/** Where the selected place's trip goes (a map point), or null: no trip to pick a route for. */
function roadDest(run, id) {
  if (!id || run.event || CW.lock || Encounter.off(run)) return null;
  if (id.startsWith('pt:')) return MapModel.ptOf(id);
  if (id.startsWith('hq')) return +id.slice(2) === run.team || !CITY.hq[+id.slice(2)] ? null : CITY.hq[+id.slice(2)];
  return SPOTS[id] && !id.startsWith('venue:') ? City.at(run, id) : null;
}
/** The short cut for the selected place (City.alt; the safe road again whenever the trip changes) and the map's route preview. */
function roadSync(run) {
  const to = roadDest(run, CW.spot),
    k = to ? `${CW.spot}|${City.pos(run)}|${City.days(run)}|${Season.wk(run)}|${Encounter.pref()}` : '';
  if (k !== ROAD.key) {
    ROAD.key = k;
    ROAD.to = to;
    ROAD.alt = to ? City.alt(run, to) : null;
    ROAD.route = 'safe'; // the safe road is the default (spec §4.37 4)
  }
  if (ROAD.mod)
    ROAD.mod.WALK.routes = ROAD.alt
      ? [
          { pts: City.route(City.pos(run), ROAD.to), on: ROAD.route !== 'alt' },
          { pts: ROAD.alt.pts, on: ROAD.route === 'alt', alt: true }
        ]
      : null;
}
/** The place card's route row (only when a short cut exists): the safe road (default) or the short cut; R toggles. */
function routeRow(run) {
  const A = ROAD.alt;
  if (!A) return '';
  const D = ENC_ROUTE[A.kind] || ENC_ROUTE.circle,
    P = A.id != null ? People.find(run, A.id) : null,
    n = P ? Team.first(P) : 'a friend',
    on = ROAD.route === 'alt';
  return `<div class="popts proute"><span class="lab">Route <kbd>R</kbd></span><div class="seg"><button class="btn ${on ? '' : 'on'}" aria-pressed="${!on}" onclick="roadPick('safe')" ${tip(ENC_ROUTE.safe.tip)}>${esc(ENC_ROUTE.safe.name)}</button><button class="btn ${on ? 'on' : ''}" aria-pressed="${on}" onclick="roadPick('alt')" ${tip(D.tip.replace(/\{n\}/g, n))}>${esc(D.name.replace(/\{n\}/g, n))}</button></div></div>`;
}
function roadPick(v) {
  if (CW.lock || !ROAD.alt) return;
  ROAD.route = v === 'alt' ? 'alt' : 'safe';
  mapPick(CW.spot);
}
/** Before a trip: forget the last one; the short cut it takes, if you picked it for this destination. */
function roadStart(to) {
  City.last = null;
  City.dayXp = null;
  return ROAD.route === 'alt' && ROAD.alt && ROAD.to && Math.hypot(ROAD.to[0] - to[0], ROAD.to[1] - to[1]) < 1 ? ROAD.alt : null;
}
/**
 * After a trip's rules: its encounter (Encounter.on on the road walked — the short cut's when picked), counted at once; the walk is
 * told where to halt and which road to take. Returns the encounter or null.
 */
function roadAfter(run, via) {
  const T = City.last;
  City.last = null;
  ROAD.route = 'safe';
  ROAD.key = '';
  if (!T) return null;
  const pts = via ? via.pts : City.route(T.from, T.to),
    E = Encounter.on(run, { ...T, pts }, { via: via ? via.key : null }),
    W = ROAD.mod && ROAD.mod.WALK;
  if (W) {
    W.routes = null;
    W.via = via ? { to: T.to, pts } : null;
    W.stop = E ? E.stop : null;
  }
  if (E) Encounter.open(run, E);
  return E;
}
/** The walk is over: nothing may halt the next one. */
function roadClear() {
  const W = ROAD.mod && ROAD.mod.WALK;
  if (W) {
    W.stop = W.via = null;
    if (W.held) W.go();
  }
}
/** The encounter card's answers: [{ t (label), c (cost → result), a (handler), pri, dis (why it can't) }]. */
function encOpts(run, E) {
  const walk = { t: 'Walk on', a: "encDo('walk')" };
  if (E.kind === 'circle') return [{ t: 'Talk', c: '→ a small memory', a: "encDo('talk')", pri: true }, walk];
  if (E.kind === 'arc') {
    const A = Team.arc(run, String(E.id));
    if (!A || A.st !== 'open') return [{ t: 'Talk', c: '→ a small memory', a: "encDo('talk')", pri: true }, walk];
    const B = Team.beat(run, A),
      c = Team.cost(run, A);
    return [{ t: B.a, c: c ? `${c} → their arc` : '→ their arc', a: "encDo('help')", pri: true }, { t: B.b, a: "encDo('refuse')" }, walk];
  }
  if (E.kind === 'crew') {
    const W = Fight.worth(run, E.ti, 0),
      d = City.scoutCost(run, E.ti),
      side = Fight.challengeSide(run),
      dis = Fight.ban(run) || City.noTime(run, d) || (run.money < side.cost ? `needs $${side.cost} for a crew` : '');
    return [
      { t: 'Challenge', c: `${d}d → a match · accepts: ${W ? W.verdict : 'refuses'}`, a: "encDo('challenge')", pri: true, dis },
      walk
    ];
  }
  const c = Fight.clashSite(run);
  if (!c) return [walk];
  const d = Fight.clashCost(run),
    dis = Fight.ban(run) || City.noTime(run, d),
    call = Fight.calledFor(run);
  return [
    ...[c.a, c.b].map((r, i) => ({
      t: `Fight for ${REGIONS[r].name}`,
      c: `${d}d → a street match${call === r ? ' · your club’s call' : ''}`,
      a: `encDo('join','${i ? 'b' : 'a'}')`,
      pri: call ? call === r : !i,
      dis
    })),
    walk
  ];
}
/** The encounter card over the map (the dialogue box): who, what they're doing, their line, the answers (1–n), Space walks on. */
function encLayer(L) {
  const run = RUN,
    E = L.enc,
    P = Encounter.person(run, E),
    first = P ? Team.first(P) : '';
  let name = '',
    sub = '',
    text = '';
  if (P) {
    const where = E.spot && SPOTS[E.spot] ? ` at ${SPOTS[E.spot].name}` : '';
    name = P.name;
    sub = `${ENC_ACT[E.act] || ENC_ACT.train}${where}`;
    const A = E.kind === 'arc' && Team.arc(run, String(E.id));
    if (A && A.st === 'open') text = `“${Team.beat(run, A).line}”`;
    else {
      const L0 = ENC_HI[Team.beh(run, E.id)] || ENC_HI.other;
      text = L0[Math.floor(hstr(`hi|${E.key}|${run.week}`) * L0.length)];
    }
  } else if (E.kind === 'crew') {
    const t = run.teams[E.ti],
      L0 = ENC_CREW[E.region] || ENC_CREW.wei;
    name = t ? `${t.name} crew` : 'A crew';
    sub = 'on the road from their HQ';
    text = L0[Math.floor(hstr(`crew|${E.ti}|${run.week}`) * L0.length)];
  } else {
    name = 'Street battle';
    sub = `${REGIONS[E.a].name} vs ${REGIONS[E.b].name} · ${E.name}`;
    text = ENC_BATTLE[Math.floor(hstr(`battle|${run.week}`) * ENC_BATTLE.length)];
  }
  const done = L.encDone != null,
    opts = done
      ? ''
      : `<ol class="sb-opts">${encOpts(run, E)
          .map(
            (o, i) =>
              `<li><button class="btn ${o.pri ? 'hot' : ''}" onclick="event.stopPropagation();${o.a}" ${o.dis ? `disabled ${tip(o.dis)}` : ''}><kbd>${i + 1}</kbd> ${esc(o.t)}${o.c ? ` <i class="mute small">${esc(o.c)}</i>` : ''}</button></li>`
          )
          .join('')}</ol>`;
  return `<div class="actlock greet enc" id="actlock" role="dialog" aria-live="polite" ${done ? 'onclick="encOn(CW.lock)"' : ''}><div class="sbox">${P && !P.gone ? `<span class="sb-face">${faceSVG(P, 0, 72)}</span>` : ''}<div class="sb-body"><b class="sb-name">${esc(name)}</b> <small class="mute">${esc(sub)}</small><p class="sb-text">${esc(done ? L.encDone || `${first} nodded. That was it.` : text)}</p>${opts}</div><span class="sb-keys"><kbd>Space</kbd> walk on</span></div></div>`;
}
/** Answer the encounter: walk on (the walk resumes), talk (their memory; then Space walks on), or leave the road for the answer. */
function encDo(what, side) {
  const L = CW.lock;
  if (!L || L.phase !== 'enc' || !L.enc || L.encDone != null) return;
  const E = L.enc;
  if (what === 'walk') return encOn(L);
  if (what === 'talk') {
    const r = Encounter.answer(RUN, E, 'talk');
    Run.save(RUN);
    L.encDone = r ? r.line : '';
    return lockPhase('enc');
  }
  encLeave(L); // the rest are a day of their own: the walk ends here, then the answer plays out
  if (what === 'help' || what === 'refuse') return arcAnswer(String(E.id), what === 'help');
  if (what === 'challenge') return mapChallenge(E.ti, false);
  if (what === 'join') return mapClash(side === 'b' ? E.b : E.a, false);
}
/** Walk on: the card closes, the avatar goes on to the place, then the day's cut-in as usual. */
function encOn(L) {
  if (!L || CW.lock !== L || L.phase !== 'enc') return;
  L.enc = L.encDone = null;
  L.phase = 'walk';
  const el = $('#actlock');
  if (el) el.outerHTML = lockLayer();
  if (ROAD.mod) ROAD.mod.WALK.go();
  lockWalk(L);
}
function encLeave(L) {
  clearInterval(actLock.iv);
  if (CW.lock === L) CW.lock = null;
  roadClear();
  const el = $('#actlock');
  if (el) el.remove();
}
/** The focus press's ring: it closes on the target circle; on the beat when they meet (ENC.focus.win). */
function focusRing(L) {
  const F = L.focus,
    c = F.st === 'hit' ? 'var(--good)' : F.st === 'miss' ? 'var(--mute)' : 'var(--cyan)';
  return `<span class="tfocus" aria-hidden="true" style="position:relative;display:block;width:64px;height:64px"><span style="position:absolute;inset:0;border:2px solid var(--line-strong);border-radius:50%"></span><span id="fring" style="position:absolute;inset:0;border:3px solid ${c};border-radius:50%;transform:scale(${focusScale(F).toFixed(3)})"></span></span>`;
}
/** The ring's scale now: 2.2 at the start, 1 (the target) at the middle of the beat, smaller after. */
function focusScale(F) {
  const f = clamp((Date.now() - F.t0) / F.ms, 0, 1),
    m = (ENC.focus.win[0] + ENC.focus.win[1]) / 2;
  return f <= m ? 2.2 - (1.2 * f) / m : 1 - (0.5 * (f - m)) / (1 - m);
}
function focusAnim(L) {
  if (typeof requestAnimationFrame !== 'function') return;
  const tick = () => {
    if (CW.lock !== L || L.phase !== 'spin' || !L.focus || L.focus.st != null) return;
    const r = document.getElementById('fring');
    if (r) r.style.transform = `scale(${focusScale(L.focus).toFixed(3)})`;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
/** Space during the cut-in: on the beat → City.focus (that day's EXP × 1.1); off it → nothing. One press. */
function focusPress() {
  const L = CW.lock,
    F = L && L.phase === 'spin' && L.focus;
  if (!F || F.st != null) return false;
  const f = (Date.now() - F.t0) / F.ms,
    hit = f >= ENC.focus.win[0] && f <= ENC.focus.win[1];
  City.focus(RUN, hit);
  F.st = hit ? 'hit' : 'miss';
  if (hit && L.fx.redo) L.fx = { ...L.fx.redo(), redo: L.fx.redo };
  Run.save(RUN);
  const r = document.getElementById('fring'),
    h = document.getElementById('fhint'); // in place: no re-pop of the card
  if (r) r.style.borderColor = hit ? 'var(--good)' : 'var(--mute)';
  if (h) h.textContent = hit ? 'On the beat — EXP +10 %' : 'Off the beat — no change';
  return true;
}
/** The road's keys (before the hub's): the card's 1–n and Space / Esc, Space in the cut-in, R for the route. */
function roadKey(e) {
  if (
    (typeof A !== 'undefined' && A) ||
    e.ctrlKey ||
    e.metaKey ||
    e.altKey ||
    typeof CW === 'undefined' ||
    !document.querySelector('.career.hub')
  )
    return;
  const L = CW.lock;
  if (L && L.phase === 'enc') {
    if (L.encDone != null) {
      if (![' ', 'Enter', 'Escape'].includes(e.key)) return;
      encOn(L);
    } else if (e.key === ' ' || e.key === 'Escape') encDo('walk');
    else if (/^[1-9]$/.test(e.key)) {
      const b = document.querySelectorAll('#actlock .sb-opts button')[+e.key - 1];
      if (!b || b.disabled) return;
      b.click();
    } else return;
  } else if (L && L.phase === 'spin' && e.key === ' ' && L.focus) {
    if (!focusPress()) return;
  } else if (
    !L &&
    (e.key === 'r' || e.key === 'R') &&
    ROAD.alt &&
    CW.spot &&
    !(e.target.closest && e.target.closest('input,select,textarea'))
  )
    roadPick(ROAD.route === 'alt' ? 'safe' : 'alt');
  else return;
  e.preventDefault();
  e.stopImmediatePropagation();
}
if (typeof addEventListener === 'function') addEventListener('keydown', roadKey, true);
