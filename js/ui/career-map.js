// The island map's UI: mounting the renderer (MapView, js/ui/map-view.js) with the model (MapModel), the panel for the
// selected place, and the actions behind its buttons. A week has 7 days of 24 hours (spec §4.41): every action takes hours plus the walk
// there (by the route); sleeping ends the day; the player ends the week. The map is dark where you haven't been: places show once explored; click any land to travel there.

/** Draw the map for this run (MapView = the renderer; MapModel = what to draw). */
function mapMount(run) {
  const el = $('#mapwrap');
  if (!el) return;
  roadMod();
  roadSync(run);
  MapView.mount(el, MapModel.build(run, CW.spot), { pick: mapPick, point: mapPoint, station: mapStation });
  figRender(); // the figure menu, if one is open (spec §4.37 7)
  Ambience.start(); // the island's sound (spec §4.37 5): only while the map is up
}
/** Empty map clicked: land → a point to travel to; sea → deselect. */
function mapPoint(p) {
  if (CW.fig) figClose();
  if (!City.onLand(p)) return mapPick(null);
  CW.spot = MapModel.ptId(p);
  if (Story.pick(RUN, CW.spot)) Run.save(RUN); // Fern's lesson for the first tile you click (spec §10.10a)
  renderCareer();
}

/**
 * What committing to the selected place would put on today's strip (spec §4.41: ghost blocks from now): the walk's hours, then its
 * own ({ k, label, h }) — a kit place's lead order for the picked hours, a sleep's 8 h. [] if nothing (an event, the week spent).
 */
function spotGhost(run, id) {
  if (!id || run.event || City.night(run)) return [];
  const walk = (at, what, h) =>
    [{ k: 'trip', label: 'Walk', h: City.trip(run, at) }, ...(what ? [{ ...what, h }] : [])].filter(b => b.h > 0);
  if (id.startsWith('hq')) {
    const ti = +id.slice(2);
    return ti === run.team || !run.teams[ti] ? [] : walk(CITY.hq[ti], { k: 'scout', label: 'Scout' }, DAY.act);
  }
  if (id === 'clash') {
    const c = Fight.clashSite(run);
    return c ? walk(c.at, { k: 'battle', label: 'Battle' }, DAY.act) : [];
  }
  if (id.startsWith('venue:')) {
    const v = VENUES[id.slice(6)];
    return v ? walk(v.at, null, 0) : [];
  }
  if (id.startsWith('pt:')) return [{ k: 'trip', label: 'Walk', h: City.travelDays(run, MapModel.ptOf(id)) }];
  if (!SPOTS[id]) return [];
  const o = City.orderOf(id),
    h = o ? ordHours(o) : City.hoursAt(id, null, SPOTS[id].act === 'rest' ? 8 : undefined);
  return walk(City.at(run, id), City.dayWhat(id), h);
}
/** The floating card for the selected place (with the route choice when a short cut exists — spec §4.37 4). */
function spotCard(run) {
  roadSync(run);
  const body = City.withInvite(run, CW.spot, () => spotPanel(run, CW.spot)), // (an Invite's yes counts on this floor: the numbers include them)
    row = inviteRow(run, CW.spot) + pickupRow(run, CW.spot) + rentRow(run, CW.spot) + rideRow(run, CW.spot) + routeRow(run);
  return `<button class="btn x" onclick="mapPick(null)" aria-label="Close">✕</button>${row ? body.replace(/<\/div>\s*$/, `${row}</div>`) : body}`;
}
/** The place card's note when an Invite's yes joins an order here (spec §4.37 7) and they aren't a teammate (those show on the floor). */
function inviteRow(run, id) {
  const v = City.joins(run, id),
    P = v != null && !Run.mates(run).some(m => m.id === v) && People.find(run, v);
  return P
    ? `<div class="popts pinv"><span class="pchip">${faceSVG(P, 0.3, 18)}${esc(firstName(P))} +${(Run.you(run).bond[v] || 0) >= 80 ? 50 : 20}%</span><small class="mute">joins your next order here</small></div>`
    : '';
}
// ---- the Ref drone (spec §4.38, T-339): the Cargo Shed's card, Rent at a court, a Pickup on the point card -------------------
/** One action row on a place card (the figure menu's row look; never the card's primary): key, name, cost → result or the gap, ⏭. */
function dronePickRow(cls, key, name, c, why, a, sim, note = '') {
  const s = sim
    ? `<button class="btn fms" onclick="${sim}" ${why ? 'disabled' : ''} ${tip(GLOSSARY.sim.long)} aria-label="Sim">⏭ <kbd>⇧${key}</kbd></button>`
    : '';
  return `<div class="popts ${cls}"><div class="fmr" style="width:100%"><button class="btn fmb" onclick="${a}" ${why ? 'disabled' : ''}><kbd>${key}</kbd><b>${esc(name)}</b><span class="oln ${why ? 'why' : ''}">${why ? esc(why) : c}</span></button>${s}</div>${note}</div>`;
}
/** The point card's Pickup row (a map point): you, the drone, the ground where you'd stand, who plays — or the gap. */
function pickupRow(run, id) {
  if (!id || !id.startsWith('pt:')) return '';
  const p = MapModel.ptOf(id),
    P = Encounter.pickup(run, p),
    foe = P.foe != null ? People.find(run, P.foe) : null,
    g = P.g ? `${P.g.name}${P.g.wind ? ' · windy' : ''}` : '',
    c = `${term('day', `${City.hrs(P.days)}`, 'cost')} ${term('sta', -P.sta, 'cost')} → ${ENC_MENU.pickup.res}${g ? ` · ${esc(g)}` : ''}${foe ? ` · vs ${esc(firstName(foe))}’s crew` : ''}${City.drone(run) === 'rent' ? ' · the rented drone' : ''}`,
    no =
      !P.why && P.refused.length
        ? `<small class="mute">${P.refused.map(r => esc(firstName(People.find(run, r.id)))).join(', ')} won’t play off a flat floor</small>`
        : '';
  return dronePickRow('ppick', 'P', ENC_MENU.pickup.name, c, P.why, `mapPickup(${p[0]},${p[1]})`, `mapPickup(${p[0]},${p[1]},true)`, no);
}
/** A court's card: Rent the drone (the walk there + $; one pickup game). Courts = Encounter.courts (explored courts and the venues). */
function rentRow(run, id) {
  const C = id && Encounter.courts(run).find(q => q.id === id);
  if (!C) return '';
  const t = City.trip(run, C.at),
    c = `${t ? term('day', `${City.hrs(t)}`, 'cost') : 'here'} $${DRONE.rent} → ${ENC_MENU.rent.res}`;
  return dronePickRow('prent', 'D', ENC_MENU.rent.name, c, City.rentWhy(run, C), `mapRent('${esc(id)}')`, '');
}
/** The Cargo Shed (the airport's freight): buy the Ref drone — the trip + a day, DRONE.buy → pickup games anywhere. */
function cargoPanel(run, id) {
  const s = SPOTS[id],
    c = City.can(run, id),
    at = City.at(run, id),
    trip = City.trip(run, at),
    days = City.cost(run, id),
    own = City.drone(run) === 'own',
    late = run.event ? 'answer the event first' : City.noTime(run, trip) || (City.outside(run, at) ? City.fence(run) : '');
  return placeCard({
    region: City.region(run, id),
    kind: 'Freight',
    title: `${s.icon} ${esc(s.name)}`,
    flavour: s.desc,
    body: kv([
      ['Ref drone', own ? '<b>yours</b>' : `$${DRONE.buy}`],
      ['Does', 'projects the lines, a light net, calls every touch'],
      ['Then', 'a Pickup on open ground: the point card, Spar anywhere'],
      ['Or', `rent one at any court · $${DRONE.rent} a match`]
    ]),
    row: [
      `<button class="btn ${c.ok ? 'hot' : ''}" onclick="mapGo('${id}')" ${c.ok ? '' : 'disabled'}>${c.ok ? `${esc(ENC_MENU.buy.name)} · ${City.hrs(days)} · $${DRONE.buy} → ${esc(ENC_MENU.buy.res)}` : esc(c.why)}</button>`,
      trip
        ? `<button class="btn" onclick="mapTravel(${at[0]},${at[1]})" ${late ? `disabled ${tip(late)}` : ''}>Walk · ${City.hrs(trip)}</button>`
        : ''
    ].filter(Boolean),
    after: hourSeg(HOURS.stretch) + ordList(run, id, false) + placeDetails(id, placeTags(run, id, trip)) // Stretch here too (T-355)
  });
}
PANELS.unshift([id => id === 'cargo', (run, id) => cargoPanel(run, id)]);
/** Play a pickup game at map point (x, y): watch it, or sim = the result at once. */
function mapPickup(x, y, sim) {
  if (CW.lock) return;
  const fx = Encounter.pickupFx(RUN, [x, y]);
  if (!fx) return;
  CW.spot = null;
  if (!sim) return watchCareer(fx);
  mapAfter(RUN, null, simCareer(fx));
}
/** Rent the drone at court id (the walk there). */
function mapRent(id) {
  const C = !CW.lock && Encounter.courts(RUN).find(q => q.id === id),
    line = C ? City.rentDrone(RUN, C) : '';
  if (!line) return;
  Run.log(RUN, line);
  mapAfter(RUN);
}
/**
 * The place popup follows its place (spec §10.1c, §4.40): beside the selected building (its anchor over the roof) or the picked-point flag, right of it when it
 * fits, else left; vertically centred on it; kept inside the map area (right of the rail, under the top bar). No pin on
 * screen → the top-right corner. One rAF loop for the page; it only measures while a popup is open.
 */
const SPOT_GAP = 24;
function spotFollow() {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(spotFollow);
  const t0 = performance.now();
  MapView.tick(); // the running clock (spec §4.43) — outside the try: a fault in it is a page error, not swallowed
  try {
    spotPlace();
    figPlace();
    mapClockTick();
  } catch (e) {
    /* a frame mid-render: try again next frame */
  }
  if (PerfHUD.on && MapView.m3) PerfHUD.rule(performance.now() - t0); // (the perf overlay's "rules" share)
}
/**
 * The map's clock (spec §4.41): the time the map shows — it runs with your walk and through the night (map3d's clock); without the 3D
 * map, the rules' hour. "Tue 14:20" in the map's top-right group, refreshed a few times a second.
 */
function mapClockTick() {
  const el = document.getElementById('mapclock');
  if (!el || !RUN || Date.now() - (mapClockTick.t || 0) < 200) return;
  mapClockTick.t = Date.now();
  const c = MapView.m3 && MapView.m3.clock ? MapView.m3.clock() : null,
    w = c && Number.isFinite(c.week) ? c.week : City.wt(RUN),
    d = Math.floor(w + 1e-6),
    t = `${WEEKDAYS[clamp(d, 0, WEEK_DAYS - 1)]} ${City.hhmm(Math.round((w - d) * 24 * 6) / 6)}`;
  if (el.textContent !== t) el.textContent = t;
}
/** Place the open popup beside its pin now. */
function spotPlace() {
  const card = document.querySelector('.hub .spotcard.open'),
    hub = card && card.closest('.hub');
  if (card && hub) {
    const pin = hub.querySelector(CW.spot && CW.spot.startsWith('pt:') ? '.maplay .mflag' : '.maplay .manchor'),
      p = pin && pin.style.display !== 'none' ? pin.getBoundingClientRect() : null;
    if (p && p.width)
      besideAt(card, hub, p.left + p.width / 2, p.top + p.height / 2, p.width / 2); // (clear of the building: its anchor spans it)
    else if (card.classList.contains('pinned')) {
      card.style.left = card.style.top = card.style.right = '';
      card.classList.remove('pinned');
    }
  }
}
/** Place a floating card beside client point (ax, ay) — hw px clear of it each side: right of it when it fits, else left; centred on it; kept inside the map area. */
function besideAt(card, hub, ax, ay, hw = 0) {
  const H = hub.getBoundingClientRect(),
    cs = getComputedStyle(hub),
    L = H.left + (parseFloat(cs.getPropertyValue('--rail')) || 0) + 16,
    T = H.top + (parseFloat(cs.getPropertyValue('--tbar')) || 0) + 16,
    R = H.right - 16,
    B = H.bottom - 16,
    w = card.offsetWidth,
    h = card.offsetHeight;
  let x = ax + hw + SPOT_GAP;
  if (x + w > R) x = ax - hw - SPOT_GAP - w; // flip to the left of the pin
  x = clamp(x, L, R - w);
  const y = clamp(ay - h / 2, T, B - h);
  card.style.left = `${Math.round(x - H.left)}px`;
  card.style.top = `${Math.round(y - H.top)}px`;
  card.style.right = 'auto';
  card.style.setProperty('--mv-origin', x < ax ? 'right center' : 'left center'); // it grows from its pin's side
  card.classList.add('pinned');
}
if (typeof requestAnimationFrame === 'function' && typeof document !== 'undefined') requestAnimationFrame(spotFollow);
function mapPick(id) {
  if (CW.fig && id) figClose(); // one card over the map at a time
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

/**
 * Spend h hours at a place (+ the walk; an order's or a sleep's length, spec §4.41). Never ends the week. The running clock (spec
 * §4.43): you walk there first (its hours counted as it begins, played in real time), then the hours fast-forward (the 'ff' lock) and
 * the rules run when they are over — or when Esc cuts a session / a sleep short (City.cutDay: the hours so far count).
 */
function mapGo(id, mate, h) {
  const run = RUN;
  mate = mate == null ? undefined : mate;
  if (!SPOTS[id] || !City.can(run, id, mate, h).ok || CW.lock) return;
  const s = SPOTS[id],
    oid = City.orderOf(id, mate), // a day order (spec §4.33): a kit place's (its lead drill by default) or Stretch (every place)
    hh = h != null ? h : oid ? ordHours(oid) : undefined,
    hard = CW.hard;
  mapFF(City.at(run, id), {
    H: City.hoursAt(id, mate, hh),
    cut: !!oid || s.act === 'rest',
    act: s.act === 'rest' && !oid ? 'sleep' : oid ? 'drill' : null,
    name: oid ? DAY_ORDERS[oid].name : s.act === 'rest' && !oid ? 'Sleeping' : s.name,
    can: () => City.can(run, id, mate, hh),
    run(done) {
      const before = oid ? trainSnap(run, DAY_ORDERS[oid].main[0]) : null,
        line = done === null ? City.day(run, id, hard, mate, hh) : City.cutDay(run, id, hard, mate, done);
      return { line, fx: oid && !/^Stopped after/.test(line) ? trainFx(run, s, before, line, oid) : null };
    }
  });
}
/** Stretch at map point (x, y) (spec §4.33: anywhere): the walk + h hours there (fast-forwarded and cut short as mapGo's). */
function mapStretch(x, y, h = ordHours('stretch')) {
  const run = RUN,
    p = [x, y];
  if (CW.lock || !City.pointCan(run, p, 'stretch', h).ok) return;
  CW.spot = null;
  mapFF(p, {
    H: h,
    cut: true,
    act: 'drill',
    name: DAY_ORDERS.stretch.name,
    can: () => City.pointCan(run, p, 'stretch', h),
    run(done) {
      const before = trainSnap(run, DAY_ORDERS.stretch.main[0]),
        H = done === null ? h : Math.floor(done + 1e-6),
        rest = done === null ? 0 : done - (H >= 1 ? H : 0),
        line =
          (H >= 1 ? City.pointDay(run, p, 'stretch', H) : `Stopped after ${City.hrs(done)}: nothing done.`) +
          (rest > 0 ? clockIdle(run, rest) : ''),
        S = { name: REGIONS[City.loc(run)].name };
      return { line, fx: H >= 1 ? trainFx(run, S, before, line, 'stretch') : null };
    }
  });
}
/** Let h hours pass after a session cut short (City.idle); the diary text it adds ('' or the nod-off). */
function clockIdle(run, h) {
  const r = City.idle(run, h);
  return r.line ? ` · ${r.line}` : '';
}
/**
 * The running clock's actions (spec §4.43): walk to map point p (City.walkTo — its hours counted now, the map plays them in real time,
 * the road's encounter as before), then the 'ff' lock: the hours of `F` ({ H, cut, act, name, can(), run(done) → { line, fx } })
 * fast-forward on the clock (ffStep) — the figure drills / sleeps, the "⏩ 2 h" badge — and F.run(null) when they are over, or
 * F.run(hours so far) on Esc when F.cut (ffStop).
 */
function mapFF(p, F) {
  const run = RUN,
    via = roadStart(p),
    walk = City.trip(run, p) ? City.walkTo(run, p) : '';
  if (walk === null) return;
  F.walk = walk || '';
  Run.save(run);
  actLock(null, null, null, walk ? roadAfter(run, via) : null);
  CW.lock.ff = { ...F, done: 0 };
  renderCareer();
}
/** The walk is over: the fast-forward starts (its rules checked again: the road may have changed things), else unlock. */
function lockFF(L) {
  const F = L.ff,
    c = F.can();
  if (!c.ok) {
    if (F.walk) Run.log(RUN, `${F.walk.trim()} ${F.name}: ${c.why}.`);
    return lockEnd();
  }
  if (MapView.m3 && MapView.m3.act) MapView.m3.act(F.act);
  lockPhase('ff');
}
/** h more game hours of the fast-forward (MapView.tick): the badge, then the end. */
function ffStep(h) {
  const L = CW.lock,
    F = L && L.phase === 'ff' && L.ff;
  if (!F) return;
  F.done = Math.min(F.H, F.done + h);
  const b = document.getElementById('ffbadge');
  if (b) b.textContent = ffText(F);
  if (F.done >= F.H - 1e-9) ffEnd(L, null);
}
/** Esc during the fast-forward: a session / a sleep stops here — the hours so far count (spec §4.43). */
function ffStop() {
  const L = CW.lock;
  if (L && L.phase === 'ff' && L.ff && L.ff.cut) ffEnd(L, L.ff.done);
}
/** The fast-forward is over (done = null: all its hours; else cut short after `done`): the rules, the diary, the result. */
function ffEnd(L, done) {
  const F = L.ff,
    r = F.run(done);
  L.ff = null;
  if (MapView.m3 && MapView.m3.act) MapView.m3.act(null);
  if (!r.line) return (F.walk && (Run.log(RUN, F.walk.trim()), Run.save(RUN)), lockEnd());
  Run.log(RUN, F.walk + r.line);
  Run.save(RUN);
  L.fx = r.fx;
  if (!r.fx) return (lockEnd(), renderCareer());
  lockPhase('done');
  setTimeout(() => CW.lock === L && L.phase === 'done' && lockEnd(), LOCK.show);
}
/** The badge's text: "⏩ 1 h 20 / 3 h". */
const ffText = F => `⏩ ${City.hrs(F.done)} / ${City.hrs(F.H)}`;
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
  const w = / · with ([^(]+?)(?: \(|$)/.exec(line); // an Invite's yes came along (spec §4.37 7)
  if (w) rows.push([statI(GLOSSARY.bond.icon, 18), 'Together', esc(w[1]), 'up', 'They trained beside you: EXP as a teammate on the floor']);
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
  const W = ROAD.mod && ROAD.mod.WALK,
    T = City.clock(RUN).last,
    gh = T && T.walk ? (T.walk[1] - T.walk[0]) * 24 : 0, // the walk's game hours: it plays in real time (spec §4.43)
    max = LOCK.max + gh * CLOCK.scale * 1000 * 1.2;
  let t = 0;
  clearInterval(actLock.iv);
  if (W) W.onHold = () => CW.lock === L && L.phase === 'walk' && L.enc && lockPhase('enc');
  actLock.iv = setInterval(() => {
    if (CW.lock !== L) return clearInterval(actLock.iv);
    if (L.phase !== 'walk') return;
    t += 120 * (t < LOCK.min ? 1 : MapView.CLK.on); // (×1 / ×2 / ×4; paused: it waits)
    if (W && W.held) return L.enc ? lockPhase('enc') : W.go(); // (a stop with nothing to show: walk on)
    if (t > LOCK.min && (!MapView.busy() || t > max)) {
      if (L.enc) return lockPhase('enc'); // no stop on the way (no 3D map, a short walk): it meets you on arrival
      clearInterval(actLock.iv);
      if (L.greet) return lockPhase('greet'); // Space / click moves on to the cut-in
      lockTrain(L);
    }
  }, 120);
}
/** The training cut-in: spinner, then the result, then unlock (no cut-in: unlock now). */
function lockTrain(L) {
  if (L.ff) return lockFF(L); // the running clock: the hours fast-forward now (spec §4.43)
  if (L.res) return lockPhase('res'); // a simmed match: its result card, until you close it
  if (!L.fx) return lockEnd();
  lockPhase('spin');
  setTimeout(() => CW.lock === L && lockPhase('done'), LOCK.spin);
  setTimeout(() => CW.lock === L && L.phase === 'done' && lockEnd(), LOCK.spin + LOCK.show);
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
  if (L && RUN && City.night(RUN)) renderCareer(); // the last day is spent: the End week ask
}
/**
 * Out of days (owner, 2026-10-05): once the lock ends with no days left, a card asks to end the week — never forced.
 * "I'll stay" closes it for this week (End week stays on the rail).
 */
function nightCard() {
  return `<div class="panel night"><h3>No days left</h3><p class="mute">You slept through day ${WEEK_DAYS}: the week is spent. End it?</p>
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
    return `<div class="actlock walk" id="actlock" role="status" aria-live="polite"><span class="lkpill"><i class="spin sm" aria-hidden="true"></i>${L.by ? `By ${esc(L.by.toLowerCase())}${L.to ? ` to ${esc(L.to)}` : ''}` : L.to ? `Walking to ${esc(L.to)}` : 'On the way'}</span></div>`;
  if (L.phase === 'greet') {
    const P = L.greet.person;
    return `<div class="actlock greet" id="actlock" role="dialog" aria-live="polite" onclick="lockGreetDone()"><div class="sbox">${P ? `<span class="sb-face">${faceSVG(P, 0, 72)}</span>` : ''}<div class="sb-body">${P ? `<b class="sb-name">${esc(P.name)}</b>` : ''}<p class="sb-text">${esc(L.greet.text)}</p>${L.greet.sub ? `<small class="mute">${esc(L.greet.sub)}</small>` : ''}</div><span class="sb-keys"><kbd>Space</kbd> next</span></div></div>`;
  }
  if (L.phase === 'res') return `<div class="actlock dim res" id="actlock" role="dialog" aria-live="polite">${L.res}</div>`;
  if (L.phase === 'enc') return encLayer(L);
  if (L.phase === 'ff')
    return `<div class="actlock walk ff" id="actlock" role="status" aria-live="polite"><span class="lkpill"><b>${esc(L.ff.name)}</b><span class="ffb" id="ffbadge">${esc(ffText(L.ff))}</span>${L.ff.cut ? '<span class="mute"><kbd>Esc</kbd> stop</span>' : ''}</span></div>`;
  const F = L.fx;
  if (L.phase === 'spin')
    return `<div class="actlock dim" id="actlock" role="status" aria-live="polite"><div class="tfx"><i class="spin" aria-hidden="true"></i><b>${esc(F.name)}</b><small class="mute">${esc(F.place)}</small></div></div>`;
  const rows = F.rows;
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
/** Challenge club ti at the chosen stake (or `stake`): refused (diary line) or played (watch, or sim = the result at once). */
function mapChallenge(ti, sim, stake = null) {
  const r = Fight.offer(RUN, ti, stake != null ? stake : (CW.stake || {})[ti] || 0);
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
/** Just travel to a point (its trip hours, at least one); `how` 'run': run it (T-309 — the ground trains you); a TRANSPORT way: ride it (spec §4.42). */
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
  if (TRANSPORT[how]) CW.lock.by = TRANSPORT[how].name; // the pill: "By bus" (spec §4.42)
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

// ---- the road (spec §4.37 3–4, T-333 / T-335): the short cut, the stop on the way ------------------------
// ROAD.mod is js/map3d/avatar3d.mjs — the same module instance the map renders with — whose WALK halts your walk at an encounter
// and draws the two routes. Display only: the rules (City / Encounter) ran before the walk began.
const ROAD = { mod: null, load: null, key: '', to: null, alt: null, route: 'safe' };
/** Load the avatar module once (its WALK), and give the island sound its footsteps. */
function roadMod() {
  if (ROAD.mod || ROAD.load || typeof document === 'undefined') return;
  ROAD.load = import(new URL('js/map3d/avatar3d.mjs', document.baseURI).href)
    .then(m => {
      ROAD.mod = m;
      Ambience.bind(m.WALK);
      if (RUN && document.querySelector('.career.hub')) roadSync(RUN);
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
    n = firstName(P, 'a friend'),
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
// ---- the figure menu (spec §4.37 7, T-340): click / right-click anyone you see → Talk · Invite · Spar · Challenge · Card ------------
// Kenshi-style: you pick, you walk over, then it happens (the rules run first, as for every map action). The road's stop (§4.37 3) is
// this same menu, opened for you where the walk halts. A row = { t (name), c (cost → result, html), a / sim (onclick), dis (why it
// can't: printed on the row — the gap), x (html under it: the stake) }; the first open row is the card's one ink primary.
/** The stake you set for club ti (as on the HQ card), within what you can stake. */
const figStake = (run, ti) => (ti >= 0 ? Math.min((CW.stake || {})[ti] || 0, Fight.stakeMax(run)) : 0);
/** The person rows for id: `fn` = the handler's name ('figDo' on the map, 'encDo' on a road stop). */
function figPersonRows(run, id, road) {
  const M0 = Encounter.menu(run, id, road);
  if (!M0) return null;
  const ti = M0[3].ti,
    st = figStake(run, ti),
    M = st ? Encounter.menu(run, id, road, st) : M0,
    fn = road ? 'encDo' : 'figDo',
    cost = R0 => (R0.days ? term('day', `${City.hrs(R0.days)}`, 'cost') : 'free'),
    [talk, inv, spar, ch] = M;
  return [
    { t: ENC_MENU.talk.name, c: `${cost(talk)} → ${ENC_MENU.talk.res}`, a: `${fn}('talk')`, dis: talk.why },
    { t: ENC_MENU.invite.name, c: `${cost(inv)} → ${ENC_MENU.invite.res} · says yes: ${inv.verdict}`, a: `${fn}('invite')`, dis: inv.why },
    {
      t: ENC_MENU.spar.name,
      c: `${term('day', `${City.hrs(spar.days)}`, 'cost')} ${term('sta', -spar.sta, 'cost')} → ${ENC_MENU.spar.res}${spar.court ? ` · ${esc(spar.court.name)}` : ''}`,
      a: `${fn}('spar')`,
      sim: `${fn}('spar',null,true)`,
      dis: spar.why
    },
    {
      t: ENC_MENU.challenge.name,
      c: `${term('day', `${City.hrs(ch.days)}`, 'cost')} $${st} → ${ENC_MENU.challenge.res} · accepts: ${ch.verdict}`,
      a: `${fn}('challenge')`,
      sim: `${fn}('challenge',null,true)`,
      dis: ch.why,
      tip: ch.said,
      x: ch.why
        ? ''
        : `<span class="fmst"><span class="lab">Stake <kbd>−</kbd><kbd>+</kbd></span><button class="btn" onclick="figStakeStep(${ti},-1)" ${st <= 0 ? 'disabled' : ''} aria-label="Lower the stake">−</button><b>$${st}</b><button class="btn" onclick="figStakeStep(${ti},1)" ${st + CHALLENGE.stakeStep > Fight.stakeMax(run) ? 'disabled' : ''} aria-label="Raise the stake">+</button></span>`
    },
    { t: ENC_MENU.card.name, c: `→ ${ENC_MENU.card.res}`, a: `${fn}('card')` }
  ];
}
/** A road stop's rows: an arc's two answers (then the person's menu), a crew's Challenge, the battle's two sides; Walk on is the key row. */
function encRows(run, E) {
  if (E.kind === 'circle' || E.kind === 'arc') {
    const A = E.kind === 'arc' && Team.arc(run, String(E.id)),
      own = figPersonRows(run, E.id, true) || [];
    if (!A || A.st !== 'open') return own;
    const B = Team.beat(run, A),
      c = Team.cost(run, A);
    return [
      { t: B.a, c: c ? `${esc(c)} → their arc` : '→ their arc', a: "encDo('help')" },
      { t: B.b, c: '→ their arc', a: "encDo('refuse')" },
      ...own
    ];
  }
  if (E.kind === 'crew') {
    const W = Fight.worth(run, E.ti, 0),
      d = City.scoutCost(run, E.ti),
      side = Fight.challengeSide(run),
      dis = Fight.ban(run) || City.noTime(run, d) || (run.money < side.cost ? `needs $${side.cost} for a crew` : ''),
      S = Encounter.spot(run, E), // on the spot, with the drone (spec §4.38)
      hd = S.field.at ? City.trip(run, S.field.at) + DAY.act : DAY.act;
    return [
      {
        t: ENC_MENU.challenge.name,
        c: `${term('day', `${City.hrs(d)}`, 'cost')} → ${ENC_MENU.challenge.res} · accepts: ${W ? W.verdict : 'refuses'}`,
        a: "encDo('challenge')",
        sim: "encDo('challenge',null,true)",
        dis,
        tip: W ? W.why : ''
      },
      {
        t: ENC_MENU.here.name,
        c: `${term('day', `${City.hrs(hd)}`, 'cost')} → ${ENC_MENU.here.res}${S.field.g ? ` · ${esc(S.field.g.name)}${S.field.g.wind ? ' · windy' : ''}` : ''} · accepts: ${W ? W.verdict : 'refuses'}`,
        a: "encDo('here')",
        sim: "encDo('here',null,true)",
        dis: S.why || City.noTime(run, hd),
        tip:
          S.why && S.cap != null && Encounter.refuses(run, S.cap, S.field.g && S.field.g.k)
            ? `“${Encounter.noLine(run, S.cap)}”`
            : W
              ? W.why
              : ''
      }
    ];
  }
  const c = Fight.clashSite(run);
  if (!c) return [];
  const d = Fight.clashCost(run),
    dis = Fight.ban(run) || City.noTime(run, d),
    call = Fight.calledFor(run),
    rows = [c.a, c.b].map((r, i) => ({
      t: `Fight for ${REGIONS[r].name}`,
      c: `${term('day', `${City.hrs(d)}`, 'cost')} → a street match${call === r ? ' · your club’s call' : ''}`,
      a: `encDo('join','${i ? 'b' : 'a'}')`,
      sim: `encDo('join','${i ? 'b' : 'a'}',true)`,
      dis
    }));
  return call === c.b ? [rows[1], rows[0]] : rows; // your club's call first (the primary)
}
/** The menu's rows as a numbered list (1–n; ⏭ = Shift + the number); the first open row is the ink primary. */
function figRows(rows) {
  const pri = rows.findIndex(o => !o.dis);
  return `<ol class="fmo">${rows
    .map((o, i) => {
      const sim = o.sim
        ? `<button class="btn fms" onclick="event.stopPropagation();${o.sim}" ${o.dis ? 'disabled' : ''} ${tip(GLOSSARY.sim.long)} aria-label="Sim">⏭ <kbd>⇧${i + 1}</kbd></button>`
        : '';
      return `<li><div class="fmr"><button class="btn fmb ${i === pri ? 'hot' : ''}" onclick="event.stopPropagation();${o.a}" ${o.dis ? 'disabled' : ''} ${o.tip ? tip(o.tip) : ''}><kbd>${i + 1}</kbd><b>${esc(o.t)}</b><span class="oln ${o.dis ? 'why' : ''}">${o.dis ? esc(o.dis) : o.c}</span></button>${sim}</div>${o.x || ''}</li>`;
    })
    .join('')}</ol>`;
}
/** The card's head: face, name, what they are doing (or a crew / the battle). */
const figHead = (P, name, sub) =>
  `<div class="fmh">${P && !P.gone ? `<span class="fmf">${faceSVG(P, 0, 40)}</span>` : ''}<div><b>${esc(name)}</b><small class="mute">${esc(sub)}</small></div></div>`;
/** What person id is doing, for the head: "Club · drilling at the Harbor Gym". */
function figSub(run, id) {
  const W = Encounter.who(run, id);
  if (!W) return '';
  const place = W.spot && SPOTS[W.spot] ? SPOTS[W.spot].name : '';
  return `${W.t ? W.t.name : 'No club'} · ${LIFE.act[W.act] || 'out'}${place ? ` at ${place}` : ` · ${LIFE.home}`}`;
}
/** The open menu's markup for person id ('' when they aren't on the map any more). */
function figMenu(run, id) {
  const rows = figPersonRows(run, id, false),
    P = People.find(run, id);
  if (!rows || !P) return '';
  return `<button class="btn x" onclick="figClose()" aria-label="Close (Esc)">✕<kbd>Esc</kbd></button>${figHead(P, P.name, figSub(run, id))}${figRows(rows)}`;
}
/** Open the menu at a named figure (a click or right-click on it on the map); not with a walk / result running, an event, a scene or a match week. */
function figOpen(id) {
  const run = RUN;
  if (!run || CW.lock || CW.sheet || Encounter.menuOff(run) || Story.step(run) || !Encounter.who(run, id)) return false;
  CW.fig = { id };
  if (CW.spot) mapPick(null); // one card over the map at a time
  figRender();
  const el = document.getElementById('figmenu');
  if (el) Motion.play(el, 'in');
  return true;
}
function figClose() {
  CW.fig = null;
  const el = document.getElementById('figmenu');
  if (el) el.remove();
}
/** Put the open menu into the hub (each render re-creates the hub: mapMount calls this), or take it away. */
function figRender() {
  const hub = document.querySelector('.career.hub');
  let el = document.getElementById('figmenu');
  const html = CW.fig && hub && !CW.lock && !CW.sheet && RUN ? figMenu(RUN, CW.fig.id) : '';
  if (!html) {
    if (el) el.remove();
    if (CW.fig && !CW.lock) CW.fig = null; // (they left the map, or a sheet opened)
    return;
  }
  if (!el || el.parentNode !== hub) {
    if (el) el.remove();
    el = document.createElement('div');
    el.id = 'figmenu';
    el.className = 'hud fmenu';
    el.setAttribute('role', 'dialog');
    hub.appendChild(el);
  }
  el.setAttribute('aria-label', (People.find(RUN, CW.fig.id) || {}).name || 'Person');
  el.innerHTML = html;
  figPlace();
}
function figStakeStep(ti, d) {
  const S = (CW.stake = CW.stake || {});
  S[ti] = clamp((S[ti] || 0) + d * CHALLENGE.stakeStep, 0, Fight.stakeMax(RUN));
  if (CW.lock && CW.lock.phase === 'enc') return lockPhase('enc');
  figRender();
}
/** Choose a row of the open menu: walk over, then it happens (Talk, Invite) — or the match / the card. sim: ⏭ (the result at once). */
function figDo(k, side, sim) {
  const run = RUN,
    F = CW.fig;
  if (!F || CW.lock) return;
  const id = F.id,
    W = Encounter.who(run, id),
    R0 = W && Encounter.row(run, id, k, false, k === 'challenge' ? figStake(run, Encounter.club(run, W)) : 0);
  if (!R0 || R0.why) return;
  figClose();
  if (k === 'card') return openPerson(id);
  if (k === 'challenge') return mapChallenge(R0.ti, !!sim);
  if (k === 'spar') {
    const fx = Encounter.spar(run, id);
    if (!fx) return;
    CW.spot = null;
    if (!sim) return watchCareer(fx);
    return mapAfter(run, null, simCareer(fx));
  }
  const trip = City.walkTo(run, W.at); // talk / invite: the walk over (its trip days), then their words
  if (trip == null) return;
  if (trip) Run.log(run, `${trip}Walked over to ${W.p.name}.`);
  const r = k === 'talk' ? Encounter.talk(run, id) : Encounter.invite(run, id);
  CW.spot = null;
  Run.save(run);
  actLock(null, { person: W.p, text: `“${r.hi}”`, sub: r.line });
  CW.lock.to = W.p.name;
  renderCareer();
}
/** The menu follows its figure like the place card its pin; no figure on screen → where it was (or its corner / the middle). */
function figPlace() {
  const L = CW.lock,
    E = L && L.phase === 'enc' && L.enc,
    open = document.getElementById('figmenu'),
    road = E && E.id != null && document.querySelector('#actlock .fmenu'),
    el = open && CW.fig ? open : road,
    id = el ? (el === open ? CW.fig.id : E.id) : null,
    hub = el && el.closest('.hub'),
    p = hub ? MapView.figureAt(id) : null;
  if (p) besideAt(el, hub, p[0], p[1]);
  if (id !== figPlace.mark) MapView.mark((figPlace.mark = id)); // the ring under their feet while the menu is open
}
/** The encounter card over the map (the figure menu, opened for you): who, what they're doing, their line, the rows (1–n), Space walks on. */
function encLayer(L) {
  const run = RUN,
    E = L.enc,
    P = Encounter.person(run, E),
    first = firstName(P, '');
  let name = '',
    sub = '',
    text = '';
  if (P) {
    name = P.name;
    sub = figSub(run, E.id) || `${ENC_ACT[E.act] || ENC_ACT.train}${E.spot && SPOTS[E.spot] ? ` at ${SPOTS[E.spot].name}` : ''}`;
    const A = E.kind === 'arc' && Team.arc(run, String(E.id));
    if (A && A.st === 'open') text = `“${Team.beat(run, A).line}”`;
    else {
      const L0 = ENC_HI[Team.beh(run, E.id)] || ENC_HI.other;
      text = `“${hitem(L0, `hi|${E.key}|${run.week}`)}”`;
    }
  } else if (E.kind === 'crew') {
    const t = run.teams[E.ti],
      L0 = ENC_CREW[E.region] || ENC_CREW.wei;
    name = t ? `${t.name} crew` : 'A crew';
    sub = 'on the road from their HQ';
    text = `“${hitem(L0, `crew|${E.ti}|${run.week}`)}”`;
  } else {
    name = 'Street battle';
    sub = `${REGIONS[E.a].name} vs ${REGIONS[E.b].name} · ${E.name}`;
    text = hitem(ENC_BATTLE, `battle|${run.week}`);
  }
  const done = L.encDone != null,
    rows = done ? '' : figRows(encRows(run, E));
  return `<div class="actlock greet enc" id="actlock" role="dialog" aria-live="polite" ${done ? 'onclick="encOn(CW.lock)"' : ''}><div class="hud fmenu road" aria-label="${esc(name)}">${figHead(P, name, sub)}<p class="fml">${esc(done ? L.encDone || `${first} nodded. That was it.` : text)}</p>${rows}<button class="btn fmb fmw" onclick="event.stopPropagation();encOn(CW.lock)"><kbd>Space</kbd><b>Walk on</b><span class="oln">→ nothing</span></button></div></div>`;
}
/**
 * Answer the stop: walk on (the walk resumes), talk / invite (their memory / answer; then Space walks on), card (walk on, their card
 * opens), or leave the road for the answer (an arc's beat, a challenge, a spar, the battle — sim: ⏭).
 */
function encDo(what, side, sim) {
  const L = CW.lock;
  if (!L || L.phase !== 'enc' || !L.enc || L.encDone != null) return;
  const E = L.enc,
    R0 = E.id != null && ['talk', 'invite', 'spar', 'challenge'].includes(what) ? Encounter.row(RUN, E.id, what, true, 0) : null;
  if (R0 && R0.why) return;
  if (what === 'walk') return encOn(L);
  if (what === 'talk' || what === 'invite') {
    const r = Encounter.answer(RUN, E, what);
    Run.save(RUN);
    L.encDone = r ? (what === 'invite' ? `“${r.hi}” ${r.line}` : r.line) : '';
    return lockPhase('enc');
  }
  if (what === 'card') {
    const id = E.id;
    encOn(L);
    return openPerson(id);
  }
  let fx = null;
  if (what === 'spar') {
    fx = Encounter.spar(RUN, E.id);
    if (!fx) return;
  }
  encLeave(L); // the rest are a day of their own: the walk ends here, then the answer plays out
  if (what === 'help' || what === 'refuse') return arcAnswer(String(E.id), what === 'help');
  if (what === 'here') {
    const r = Encounter.answer(RUN, E, 'here'); // the crew on the spot, with the drone (spec §4.38)
    CW.spot = null;
    if (!r) return mapAfter(RUN);
    if (r.line) return mapAfter(RUN);
    if (!sim) return watchCareer(r.fx);
    return mapAfter(RUN, null, simCareer(r.fx));
  }
  if (what === 'challenge') {
    if (E.kind === 'crew') return mapChallenge(E.ti, !!sim, 0); // (a crew on the road: no stake)
    return mapChallenge(R0.ti, !!sim);
  }
  if (what === 'spar') {
    CW.spot = null;
    if (!sim) return watchCareer(fx);
    return mapAfter(RUN, null, simCareer(fx));
  }
  if (what === 'join') return mapClash(side === 'b' ? E.b : E.a, !!sim);
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
// ---- street level (spec §4.37 6, T-336b): the order at the kit -----------------------------------------------------------
// The map (interior3d.mjs via map3d) reports the station you stand at, with its client point; the prompt over it is the place
// card's own button for that order (ordBtn, the card's numbers under City.withInvite) — F (or a click on the station) runs it.
const STP = { st: null, key: '', t: 0 };
/**
 * A station's action — the place card's own button (spec §4.37 6 Phase 3): a day order → mapGo(place, order); the bed → Sleep 8 h
 * (mapGo(place, null, 8); the prompt lists 8 / 6 / 4); a place's own Go (an outing, a secret place, the drone) → mapGo(place[, opt]);
 * the Harbor Market's bikes / scooters → mapGo('market', k); a card station (a desk, a club board, a counter, a court) → its card.
 */
function stationAct(st) {
  if (!st) return null;
  const S = SPOTS[st.place];
  if (st.order && S && City.orders(st.place).includes(st.order)) return { fn: 'mapGo', args: [st.place, st.order] };
  if (st.sleep && S && S.act === 'rest') return { fn: 'mapGo', args: [st.place, null, DAY.sleepH[DAY.sleepH.length - 1]] };
  if (st.buy && S && S.act === 'ride') return { fn: 'mapGo', args: [st.place, st.buy] };
  if (st.act && S && S.act) return { fn: 'mapGo', args: typeof st.act === 'string' ? [st.place, st.act] : [st.place] };
  return { fn: 'mapPick', args: [st.place] };
}
/** The F button: the place card's own control, its cost → result, the hotkey printed; locked → the gap below. */
function stationBtn(head, call, name, line, c) {
  return `${head}<button class="btn fmb ord ${c.ok ? 'hot' : ''}" onclick="${call}" ${c.ok ? '' : 'disabled'}><kbd>F</kbd><b class="onm">${esc(name)}</b><span class="oln">${line}</span></button>${c.ok ? '' : `<small class="why">${esc(c.why)}</small>`}`;
}
/** The prompt's inside: the station's name, then its action as the place card shows it (cost → result; the gap when locked), key F. */
function stationHTML(run, st) {
  const act = stationAct(st),
    call = `${act.fn}(${act.args.map(a => (a == null ? 'null' : typeof a === 'number' ? a : `'${esc(a)}'`)).join(',')})`,
    head = `<small class="stn">${esc(st.name)}</small>`,
    id = act.args[0],
    S = SPOTS[id];
  if (act.fn !== 'mapGo') {
    const nm =
      (S || {}).name ||
      (VENUES[id.replace(/^venue:/, '')] || {}).name ||
      (/^hq\d+$/.test(id) && run.teams[+id.slice(2)] ? run.teams[+id.slice(2)].name : 'the place');
    return `${head}<button class="btn fmb hot" onclick="${call}"><kbd>F</kbd><b>${esc(nm)}</b><span class="oln">Open the card</span></button>`;
  }
  if (st.sleep) {
    // the bed: Sleep 8 / 6 / 4 h (the card's own rows), F = the first (8 h)
    const at = City.at(run, id),
      rows = sleepRows(run, id, City.trip(run, at), City.price(run, id))
        .replace('class="btn ord', 'class="btn fmb ord')
        .replace('<b class="onm">', '<kbd>F</kbd><b class="onm">');
    return `${head}${rows}`;
  }
  if (st.buy) {
    const T = TRANSPORT[st.buy],
      c = City.can(run, id, st.buy);
    return stationBtn(
      head,
      call,
      City.owns(run, st.buy) ? `${T.name} · yours` : `Buy the ${st.buy}`,
      `${term('day', `${City.hrs(City.cost(run, id, st.buy))}`, 'cost')} $${T.price} → ${T.pace}× walking on roads`,
      c
    );
  }
  if (!st.order) {
    // a place's own Go (an outing, a secret place, the drone): the card's button
    const c = City.can(run, id, act.args[1] || undefined),
      cost = City.price(run, id);
    return stationBtn(
      head,
      call,
      st.verb || 'Go',
      `${term('day', `${City.hrs(City.hoursAt(id))}`, 'cost')}${cost ? ` $${cost}` : ''} → ${esc(S.desc || S.name)}`,
      c
    );
  }
  const oid = act.args[1],
    h = ordHours(oid); // the card's picked hours (spec §4.41)
  return City.withInvite(run, id, () => {
    const c = City.can(run, id, oid, h),
      pv = Training.preview(run, oid, CW.hard && !run.injury, dayX(run, id) * Training.units(h), id, h),
      b = ordBtn(run, DAY_ORDERS[oid], pv, c, call, h, City.price(run, id, oid, h), c.ok)
        .replace('class="btn ord', 'class="btn fmb ord')
        .replace('<b class="onm">', '<kbd>F</kbd><b class="onm">');
    return `${head}${b}${c.ok ? '' : `<small class="why">${esc(c.why)}</small>`}`;
  });
}
/** From the map: the station you stand at (client x / y) or null; click = run it now (a click on the station in the world). */
function mapStation(st, click) {
  const hub = document.querySelector('.career.hub'),
    run = RUN,
    off = !st || !hub || !run || CW.lock || CW.sheet || CW.fig || A || hub.querySelector('.brief'); // (not over the week's brief)
  let el = document.getElementById('stprompt');
  STP.st = off ? null : st;
  if (off) return void (el && el.remove());
  if (click) {
    const a = stationAct(st);
    return void (a && window[a.fn](...a.args));
  }
  if (!el || el.parentNode !== hub) {
    if (el) el.remove();
    el = document.createElement('div');
    el.id = 'stprompt';
    el.className = 'hud stprompt';
    el.setAttribute('role', 'dialog');
    hub.appendChild(el);
    STP.key = '';
  }
  const now = Date.now(),
    key = `${st.place}|${st.id}`;
  if (key !== STP.key || now - STP.t > 400) {
    const html = stationHTML(run, st);
    if (el.innerHTML !== html) el.innerHTML = html;
    if (key !== STP.key) Motion.play(el, 'in');
    el.setAttribute('aria-label', st.name);
    STP.key = key;
    STP.t = now;
  }
  el.style.left = `${Math.round(st.x)}px`;
  el.style.top = `${Math.round(st.y)}px`;
}
/** The road's keys (before the hub's): the card's 1–n and Space / Esc, R for the route. */
function roadKey(e) {
  if (A || e.ctrlKey || e.metaKey || e.altKey || !document.querySelector('.career.hub')) return;
  const L = CW.lock;
  if (L && L.phase === 'enc') {
    if (L.encDone != null) {
      if (![' ', 'Enter', 'Escape'].includes(e.key)) return;
      encOn(L);
    } else if (e.key === ' ' || e.key === 'Escape') encDo('walk');
    else if (!figKey(e, document.querySelector('#actlock .fmenu'))) return;
  } else if (!L && CW.fig && !(e.target.closest && e.target.closest('input,select,textarea'))) {
    if (e.key === 'Escape') figClose();
    else if (!figKey(e, document.getElementById('figmenu'))) return;
  } else if (
    !L &&
    (e.key === 'r' || e.key === 'R') &&
    ROAD.alt &&
    CW.spot &&
    !(e.target.closest && e.target.closest('input,select,textarea'))
  )
    roadPick(ROAD.route === 'alt' ? 'safe' : 'alt');
  else if (!L && !CW.fig && STP.st && /^[fF]$/.test(e.key) && !(e.target.closest && e.target.closest('input,select,textarea'))) {
    // the prompt at a station (spec §4.37 6): F runs its button
    const b = document.querySelector('#stprompt .fmb');
    if (!b) return;
    if (!b.disabled) b.click();
  } else if (!L && CW.spot && /^[pPdD]$/.test(e.key) && !(e.target.closest && e.target.closest('input,select,textarea'))) {
    // the drone's rows (spec §4.38): P a pickup (Shift: ⏭), D rent the drone
    const row = document.querySelector(/[pP]/.test(e.key) ? '.spotcard .ppick' : '.spotcard .prent'),
      b = row && row.querySelector(e.shiftKey ? '.fms' : '.fmb');
    if (!b) return;
    if (!b.disabled) b.click();
  } else return;
  e.preventDefault();
  e.stopImmediatePropagation();
}
/** The figure menu's keys: 1–n a row, Shift + n its ⏭ Sim, − / + the stake. True if one was used. */
function figKey(e, menu) {
  if (!menu) return false;
  const n = /^Digit[1-9]$/.test(e.code) ? +e.code.slice(5) : /^[1-9]$/.test(e.key) ? +e.key : 0,
    li = n ? menu.querySelectorAll('.fmo > li')[n - 1] : null,
    st = menu.querySelector('.fmst');
  let b = null;
  if (li) b = li.querySelector(e.shiftKey ? '.fms' : '.fmb');
  else if (st && (e.key === '-' || e.key === '+' || e.key === '=')) b = st.querySelectorAll('button')[e.key === '-' ? 0 : 1];
  if (!b) return false;
  if (!b.disabled) b.click();
  return true;
}
if (typeof addEventListener === 'function') addEventListener('keydown', roadKey, true);
