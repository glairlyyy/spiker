// The island map phase of a training week: 7 days of 24 hours (spec §4.41, `run.clock`). Every action costs hours — a day
// order 2–4 h (HOURS), an outing or a match its own, the walk there by the route (City.trip, in 5-minute steps) — and sleeping
// (home or a hotel, 4 / 6 / 8 h) ends the day. Up past 02:00 you nod off where you stand. A match you are made to play starts at
// 13:00 (DAY.match). The map is dark where you haven't been (run.fog: points you've stood on, each revealing REVEAL_R around
// it). The week ends only when the player ends it (sleeping through day 7 leaves only End week).
// The running clock (spec §4.43): on the map time runs (js/ui/map-view.js drives it) — City.idle lets the hours pass with nothing
// done; a session or a sleep cut short counts the hours so far (City.cutDay). The rules count the same hours either way.
// Places belong to regions (REGIONS): the region sets the price and the quality; Wei's premium places may turn out
// overhyped and Shu's rough ones may be hidden gems (rolled per run, found out by training there). DOM-free.

/** City.path results by end points (pure, so safe to keep; ROADS never changes at run time). */
const PATH_CACHE = new Map();
const City = {
  // ---- the day in hours (spec §4.41) ------------------------------------------------------------------------------------
  /** The clock: { day 1–7 (8 = the week spent), hour (07 = 7, past midnight 24 +), log: today's blocks { k, label, at?, stat?, from, h } }. */
  clock: run => run.clock || (run.clock = City.freshClock()),
  freshClock: (hour = DAY.wake) => ({ day: 1, hour, log: [], last: null, met: [] }),
  /** Days left this week, today included (0: the week is spent — only End week remains). */
  days: run => Math.max(0, WEEK_DAYS - City.clock(run).day + 1),
  night: run => City.days(run) <= 0,
  /** The hour now (07 = 7; 01:00 after midnight = 25). */
  hour: run => City.clock(run).hour,
  /** "07:00" for an hour (wraps past midnight; to the minute). */
  hhmm(h) {
    const m = ((Math.round(h * 60) % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  },
  /** Hours as the screen prints them (spec §4.43: walks in 5-minute steps): "2 h", "1 h 20", "25 min". */
  hrs(h) {
    const m = Math.round(h * 60),
      H = Math.floor(m / 60),
      M = m % 60;
    return !H ? `${M} min` : M ? `${H} h ${String(M).padStart(2, '0')}` : `${H} h`;
  },
  /** City.hoursAt's answer while a session or a sleep cut short is being counted (City.cutDay), else null. */
  hOver: null,
  /** The hours a place's thing takes there (not the walk): an order's `h` (or its first option), a sleep's, an outing's own, else DAY.act. */
  hoursAt(id, oid, h) {
    if (City.hOver !== null) return City.hOver;
    const s = SPOTS[id],
      o = City.orderOf(id, oid);
    if (o) return City.hourOpts(o).includes(h) ? h : City.hourOpts(o)[0];
    if (s && s.act === 'rest') return DAY.sleepH.includes(h) ? h : DAY.sleepH[DAY.sleepH.length - 1];
    if (s && (s.act === 'cargo' || s.act === 'ride')) return 1;
    return (s && s.hours) || DAY.act;
  },
  /** The hour choices of day order oid (spec §4.41): Stretch from 1 h, drills and work 2–4 h; a raid / a run take their own. */
  hourOpts: oid =>
    oid === 'stretch' ? HOURS.stretch : DAY_ORDERS[oid] && ['drill', 'work'].includes(DAY_ORDERS[oid].kind) ? HOURS.opts : [DAY.act],
  /** Hours an action at a place takes: the walk there + its own (h: the order's / the sleep's length). */
  cost: (run, id, oid, h) => City.trip(run, City.at(run, id)) + City.hoursAt(id, oid, h),
  /**
   * Why h more hours from now don't fit ('' if they do): the week spent; past 02:00 (sleep — `bed`: it is the sleep, never refused
   * for the hour); a match week's 13:00 kick-off — the action and the walk on from `to` (a map point; null: from here) to the
   * venue must end by then.
   */
  noTime(run, h, to = null, bed = false) {
    const C = City.clock(run);
    if (City.night(run)) return 'no days left — end the week';
    if (C.hour >= DAY.late && !bed) return 'past 02:00 — sleep';
    const mt = City.matchAt(run);
    if (mt) {
      const walk = mt.at ? City.walkH(to || City.pos(run), mt.at) : 0,
        by = DAY.match - walk;
      if (C.hour + h > by + 1e-6)
        return `the match is at ${City.hhmm(DAY.match)}${walk ? ` (${City.hrs(walk)} walk to ${mt.name})` : ''} — be there`;
    }
    return '';
  },
  /** This week's match you are made to play, before it is played: { at (the venue's point or null), name } — else null. */
  matchAt(run) {
    const t = Run.weekType(run);
    if (t !== 'eval' && t !== 'cup') return null;
    const v = City.venue(run);
    return v && VENUES[v] ? { at: VENUES[v].at, name: VENUES[v].name } : { at: null, name: 'the match' };
  },
  /**
   * Pass h hours (callers checked they fit): today's log gets the block `what` ({ k, label, at?, stat? }); the clock moves on (an
   * action that ends past 02:00 puts you to sleep where you stand after it: City.upLate).
   */
  pass(run, h, what) {
    const C = City.clock(run);
    if (h > 0 && what) C.log.push({ ...what, from: C.hour, h });
    C.hour += h;
  },
  /**
   * The running clock (spec §4.43): h hours pass with nothing done (you stand, wait, look round) — no block on today's strip. It stops
   * at the hour you must leave for a match you are made to play (City.leaveBy: the clock waits for you there) and when the week is
   * spent; at 02:00 you nod off where you stand (City.nod). Returns { h (the hours that passed), line (the diary text, '' if none) }.
   */
  idle(run, h) {
    const C = City.clock(run);
    if (!(h > 0) || City.night(run)) return { h: 0, line: '' };
    const by = City.leaveBy(run);
    if (by !== null) h = Math.min(h, Math.max(0, by - C.hour));
    if (C.hour + h >= DAY.late) {
      const d = Math.max(0, DAY.late - C.hour);
      C.hour = DAY.late;
      return { h: d, line: City.nod(run).replace(/^ · /, '') };
    }
    C.hour += h;
    return { h, line: '' };
  },
  /** The hour you must set off for this week's match you are made to play (DAY.match − the walk to its venue), or null (none). */
  leaveBy(run) {
    const mt = City.matchAt(run);
    return mt ? DAY.match - (mt.at ? City.walkH(City.pos(run), mt.at) : 0) : null;
  },
  /**
   * A session or a sleep at place id cut short after `done` hours (spec §4.43: Esc — the hours so far count, the rest is lost):
   * an order counts its whole hours (the same tables as a 1–4 h session; under an hour: nothing done), a sleep every minute
   * (City.sleepK); the rest of the time passes (City.idle). Callers stand at the place (the walk was taken). The diary line.
   */
  cutDay(run, id, hard, mate, done) {
    const oid = City.orderOf(id, mate),
      s = SPOTS[id],
      sleep = !oid && s && s.act === 'rest',
      H = sleep ? Math.round(done / CLOCK.min) * CLOCK.min : Math.floor(done + 1e-6);
    let line = '';
    if (H >= (sleep ? CLOCK.min : 1)) {
      City.hOver = H;
      try {
        line = City.day(run, id, hard, mate, H);
      } finally {
        City.hOver = null;
      }
    }
    const rest = sleep ? 0 : done - (line ? H : 0),
      r = City.idle(run, rest);
    return `${line || `Stopped after ${City.hrs(done)}: nothing done.`}${line && !sleep ? ` (stopped after ${City.hrs(done)})` : ''}${r.line ? ` · ${r.line}` : ''}`;
  },
  /** The share of the missing stamina h hours of sleep bring back (DAY.sleep, in between and under 4 h by straight lines from 0). */
  sleepK(h) {
    if (DAY.sleep[h]) return DAY.sleep[h];
    const ks = [0, ...DAY.sleepH],
      v = k => (k ? DAY.sleep[k] : 0);
    for (let i = 1; i < ks.length; i++)
      if (h <= ks[i]) return v(ks[i - 1]) + ((h - ks[i - 1]) / (ks[i] - ks[i - 1])) * (v(ks[i]) - v(ks[i - 1]));
    return v(ks[ks.length - 1]);
  },
  /** Week time (days since the week began, fractional) at hour `hr` of today — for the map's clock (MapModel.time). */
  wt: (run, hr = City.hour(run)) => City.clock(run).day - 1 + hr / 24,
  /** The last action's span for the map (walk, then its own block) in week time: { walk: [a, b] | null, act: [a, b] | null }. */
  mark(run, h0, walkH, actH) {
    const C = City.clock(run);
    C.last = {
      walk: walkH ? [City.wt(run, h0), City.wt(run, h0 + walkH)] : null,
      act: actH ? [City.wt(run, h0 + walkH), City.wt(run, h0 + walkH + actH)] : null
    };
  },
  /**
   * Sleep h hours (4 / 6 / 8, spec §4.41) where you are: `mul` = how well you sleep there (home: your housing's rest; a hotel:
   * HOTEL.rest; nodding off: DAY.nodMul). Brings back DAY.sleep[h] × mul of the missing stamina (all of it at most), 4 h costs mood;
   * the day ends: its summary joins the week's day track (run.dayLog) and you wake on the next day. Returns the diary text.
   */
  sleep(run, h, mul = World.restMul(run), at = null) {
    const C = City.clock(run),
      start = C.hour,
      frac = Math.min(1, City.sleepK(h) * mul * (Feel.has(run, 'insomnia') ? SCARS.insomnia.k : 1)), // Insomnia (spec §4.30)
      out = [Run.bump(run, 'sta', Math.round((run.staMax - run.sta) * frac))],
      mood = DAY.sleepMood[h] || (h < DAY.sleepH[0] ? DAY.sleepMood[DAY.sleepH[0]] : 0); // (a sleep cut short under 4 h: the 4 h dip)
    if (mood) out.push(Run.bump(run, 'mood', mood));
    C.log.push({ k: 'sleep', label: `Sleep ${City.hrs(h)}`, at, from: start, h });
    City.endDay(run, start, h);
    return `Slept ${City.hrs(h)}${at ? ` (${at})` : ''}: ${out.filter(Boolean).join(', ') || 'rested'}`;
  },
  /** Up past 02:00 (spec §4.41): you nod off where you stand — 4 h, poor sleep, mood down. The diary text. */
  nod(run) {
    const line = City.sleep(run, DAY.nod, DAY.nodMul, 'nodded off');
    return ` · past 02:00: ${line.replace(/^Slept/, 'nodded off,')}`;
  },
  /** End today after a sleep from hour `start` for h hours: the day's summary on the day track; the next day starts at the wake hour. */
  endDay(run, start, h) {
    const C = City.clock(run),
      end = start + h;
    (run.dayLog || (run.dayLog = [])).push(City.daySum(C.log));
    const wake = end % 24,
      s0 = end >= 24 ? Math.max(0, start - 24) : start;
    C.day++;
    C.hour = wake;
    C.met = [];
    C.log = wake > s0 ? [{ k: 'sleep', label: `Sleep ${City.hrs(h)}`, from: s0, h: wake - s0 }] : [];
    C.last = { walk: null, act: [City.wt(run, start) - 1, City.wt(run, wake)] };
  },
  /** A day's entry on the week's day track (spec §10.2): its longest block that isn't a walk or sleep (else the walk, else a rest). */
  daySum(log) {
    const by = (ks, not) => log.filter(b => (ks ? ks.includes(b.k) : !not.includes(b.k))).reduce((a, b) => (!a || b.h > a.h ? b : a), null);
    const b = by(null, ['trip', 'sleep']) || by(['trip']);
    return b ? { k: b.k, label: b.label, stat: b.stat, at: b.at } : { k: 'rest', label: 'Rest' };
  },
  /**
   * The match you were made to play was played (spec §4.41; Cup.result, before the week moves on): the walk to its venue (if you
   * were not there), a wait until DAY.match, the match's DAY.matchH hours; you stand at the venue.
   */
  matchPlayed(run) {
    const mt = City.matchAt(run);
    if (!mt || City.night(run)) return;
    const C = City.clock(run),
      h0 = C.hour,
      t = mt.at ? City.trip(run, mt.at) : 0;
    City.pass(run, t, { k: 'trip', label: 'Walk', at: mt.name });
    C.hour = Math.max(C.hour, DAY.match);
    const hm = C.hour;
    City.pass(run, DAY.matchH, { k: 'battle', label: 'Match', at: mt.name });
    C.last = { walk: t ? [City.wt(run, h0), City.wt(run, h0 + t)] : null, act: [City.wt(run, hm), City.wt(run, hm + DAY.matchH)] };
    if (mt.at) City.moveTo(run, mt.at);
  },
  /** The night passes without a sleep of yours (a Cup's rounds, day after day): the next day's wake hour, today's log on the day track. */
  nextMorning(run) {
    const C = City.clock(run);
    (run.dayLog || (run.dayLog = [])).push(City.daySum(C.log));
    Object.assign(C, { day: Math.min(WEEK_DAYS, C.day + 1), hour: DAY.wake, log: [], last: null, met: [] });
  },
  /**
   * Hours on foot from map point a to b (spec §4.41): the route's cost ÷ WALK_PACE (÷ RUN_PACE more when run), in CLOCK.min steps (5
   * game minutes, one at least — spec §4.43: no 1 h minimum); 0 when you are there.
   */
  walkH(a, b, ran = false) {
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) <= HERE_R) return 0;
    return City.step(City.path(a, b).cost / (WALK_PACE * (ran ? RUN_PACE : 1)));
  },
  /** Hours in the rules' steps (CLOCK.min, one at least). */
  step: h => Math.max(1, Math.round(h / CLOCK.min)) * CLOCK.min,
  /** Region of a place (home: where you live). */
  region: (run, id) => Front.owner(run, id) || (HOUSING[run.housing] || HOUSING.studio).region || 'open',
  /** Map position of a place (home moves with your housing). */
  at: (run, id) => (SPOTS[id].at ? SPOTS[id].at : HOME_AT[run.housing] || HOME_AT.studio),
  /** The training places for a key (their lead training). */
  spotsFor: key => Object.keys(SPOTS).filter(id => SPOTS[id].train === key),
  /** The day orders at place id (spec §4.33): its kit's, then Stretch — every place has it (T-355: the island is the gym); [] for no place. */
  orders(id) {
    const s = SPOTS[id];
    if (!s) return [];
    return [...(s.kit ? new Set(s.kit.flatMap(t => KITS[t].orders)) : []), 'stretch'];
  },
  /** A place's lead order: its first drill (the card's primary), else its first order; null without any. */
  lead(id) {
    const o = City.orders(id);
    return o.find(k => DAY_ORDERS[k].kind === 'drill') || o[0] || null;
  },
  /** The order a day at place id runs for option `opt` (an order offered there; a kit place without one: its lead drill), else null. */
  orderOf: (id, opt) =>
    DAY_ORDERS[opt] && City.orders(id).includes(opt) ? opt : SPOTS[id] && SPOTS[id].kit && !DAY_ORDERS[opt] ? City.lead(id) : null,
  /** Your faction's region (null while a free agent). */
  myRegion: run => (run.team != null && FACTIONS[run.team] ? FACTIONS[run.team].region : null),
  /** Home-turf bonus at a place: it lies in your faction's region. */
  turf(run, id) {
    const r = City.myRegion(run);
    return r && City.region(run, id) === r ? TURF_BONUS : 0;
  },
  /**
   * Quality of every place this run: { id: { q, tag, known } }. Wei places are advertised premium but may be
   * overhyped; Shu places are rough but may be hidden gems — both found out once you've trained there.
   */
  roll(run) {
    run.spotQ = {};
    for (const id of Object.keys(SPOTS)) {
      const s = SPOTS[id],
        R0 = REGIONS[s.region];
      if (!s.train || !R0) continue;
      let q = R0.q,
        tag = '',
        known = true;
      if (R0.hype) {
        known = false;
        if (R() < R0.hype) ((q = 1), (tag = 'overhyped'));
      } else if (R0.gem) {
        known = false;
        if (R() < R0.gem) ((q = 1.25), (tag = 'gem'));
      }
      run.spotQ[id] = { q, tag, known };
    }
  },
  quality(run, id) {
    const Q = (run.spotQ && run.spotQ[id]) || { q: (REGIONS[SPOTS[id].region] || REGIONS.open).q, tag: '', known: true };
    return Object.assign({}, Q, { q: Math.round(Q.q * Front.qMul(run, City.region(run, id)) * 100) / 100 });
  },
  /** Money for a session / outing / hotel night at a place (0 at home and in the park); a kit place: the order's price (default: its lead drill) for h hours (§4.41: × the hours' units). */
  price(run, id, oid, h) {
    const s = SPOTS[id],
      r = City.region(run, id),
      p =
        ((REGIONS[r] || REGIONS.open).price || 1) *
        Front.priceMul(run, r) *
        (r && r === City.myRegion(run) && World.tenure(run) >= TENURE.members ? TENURE.price : 1); // members' price (spec §4.36)
    const o = DAY_ORDERS[oid] ? oid : s.kit ? City.lead(id) : null;
    if (o)
      return Math.round(
        TRAIN_FEE * (DAY_ORDERS[o].price || 0) * p * Training.units(City.hourOpts(o).includes(h) ? h : City.hourOpts(o)[0])
      );
    if (s.act === 'cargo') return DRONE.buy; // (freight: a flat price)
    if (s.hotel) return Math.round(HOTEL.price * p);
    return s.cost ? Math.round(s.cost * p) : 0;
  },
  /** Gain multiplier of a session at a place: its quality × home turf. */
  mul: (run, id) => City.quality(run, id).q * (1 + City.turf(run, id)),
  /** Where you stand on the map ([x, y]); a run starts at the airport. */
  pos: run => (Array.isArray(run.pos) ? run.pos : REGIONS.wu.at),
  /** The region you are in. */
  loc: run => City.regionAt(City.pos(run)),
  /**
   * The venue (VENUES id) of this week's match, or null (spec §4.21; pure): a cup week → the arena; an evaluation week → the Academy
   * Hall for the Academy's, else the venue that holds `eval:<your faction's region>`. Display only: nothing travels.
   */
  venue(run) {
    const t = Run.weekType(run);
    if (t === 'cup') return 'arena';
    if (t !== 'eval') return null;
    const e = run.eval && run.eval.week === run.week ? run.eval : null,
      kind = e ? e.kind : Eval.kind(run);
    if (kind === 'academy') return 'hall';
    const region = e ? e.region : FACTIONS[run.team].region;
    return Object.keys(VENUES).find(id => VENUES[id].holds.includes(`eval:${region}`)) || null;
  },
  /** The region at a map point: a minor's patch, Central Academy, else the major whose land it is. */
  regionAt([x, y]) {
    for (const [r, e] of Object.entries(CITY.minors)) {
      const a = (-e.rot * Math.PI) / 180,
        dx = x - e.x,
        dy = y - e.y,
        u = dx * Math.cos(a) - dy * Math.sin(a),
        v = dx * Math.sin(a) + dy * Math.cos(a);
      if ((u / e.rx) ** 2 + (v / e.ry) ** 2 <= 1) return r;
    }
    if (Hex.dist(Hex.idAt([x, y]), Hex.idAt([CITY.park.x, CITY.park.y])) <= ACADEMY.ring) return 'open'; // the Academy's tiles (§4.18e)
    for (const r of MAJORS) if (inPoly([x, y], CITY[r])) return r;
    return 'open';
  },
  /** On the island? */
  onLand: p => inPoly(p, CITY.coast),
  /** Walking hours from where you are to point p (spec §4.41): 0 when you stand there, else the route ÷ WALK_PACE, 1 h at least. */
  trip: (run, p) => City.walkH(City.pos(run), p),
  /** Stand at p (you've spent the days): the fog lifts around it. */
  moveTo(run, p) {
    run.pos = [Math.round(p[0]), Math.round(p[1])];
    City.reveal(run, run.pos);
  },
  reveal(run, p) {
    const F = run.fog || (run.fog = []);
    if (!F.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 30)) F.push([Math.round(p[0]), Math.round(p[1])]);
  },
  /** Explored: near a point you've stood on. */
  seen: (run, p) => (run.fog || []).some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) <= REVEAL_R),
  /** Does the place's owner let you in? { ok, why }: grudge, then the owner's condition; its members always pass. */
  access(run, id) {
    const s = SPOTS[id];
    if (!s || s.region == null || s.region === 'open') return { ok: true, why: '' };
    const owner = City.region(run, id);
    if (run.team != null && FACTIONS[run.team] && FACTIONS[run.team].region === owner) return { ok: true, why: '' };
    const rep = City.rep(run, owner);
    if (rep <= ACCESS.grudge) return { ok: false, why: `${REGIONS[owner].name} won't let you in (standing ${rep})` };
    const c = ACCESS.cond[owner] || {},
      you = Run.you(run),
      miss = [];
    if (c.ovr && ovr(you) < c.ovr) miss.push(`OVR ${c.ovr}`);
    if (c.key && you[KEYSTAT[you.role]] < c.key) miss.push(`${STATNAME[KEYSTAT[you.role]]} ${c.key}`);
    if (c.star && !you.star) miss.push('★ star');
    if (c.fans && run.fans < c.fans) miss.push(`${c.fans.toLocaleString()} fans`);
    return miss.length ? { ok: false, why: `${REGIONS[owner].name} asks for ${miss.join(', ')}` } : { ok: true, why: '' };
  },
  /**
   * Story mode's first week (spec §10.10a, owner 2026-10-04): you stay on the Academy's grounds. The reason text while it
   * holds ('' after week 1, in Endless, or when no scene ever runs); `outside(run, p)` = it holds and p is off campus.
   */
  fence: run =>
    Story.on(run) && run.week === 1 && Season.year(run) === 1 && run.story.flags.campus
      ? 'Week 1 — the campus first (Fern: learn the routine)'
      : '',
  outside: (run, p) => !!City.fence(run) && City.regionAt(p) !== 'open',
  /** Can you do this now? { ok, why }. mate: a teammate (dinner), a secret place's choice, or a day order (spec §4.33); h: its hours (§4.41). */
  can(run, id, mate, h) {
    const s = SPOTS[id];
    if (!s) return { ok: false, why: 'unknown place' };
    if (DAY_ORDERS[mate] && !City.orders(id).includes(mate)) return { ok: false, why: 'not done here' };
    if (s.secret && !Secret.known(run, id)) return { ok: false, why: 'unknown place' };
    const ord = !!DAY_ORDERS[mate]; // a day order (Stretch at an outing / a secret place): the place's own act rules don't apply
    if (!ord && s.act === 'cargo' && City.drone(run) === 'own') return { ok: false, why: 'you have the drone' };
    if (run.event) return { ok: false, why: 'answer the event first' };
    if (s.at && City.outside(run, s.at)) return { ok: false, why: City.fence(run) };
    const acc = City.access(run, id);
    if (!acc.ok) return acc;
    const late = City.noTime(run, City.cost(run, id, mate, h), City.at(run, id), s.act === 'rest' && !DAY_ORDERS[mate]);
    if (late) return { ok: false, why: late };
    const oid = City.orderOf(id, mate),
      cost = City.price(run, id, oid, h);
    if (cost && run.money < cost) return { ok: false, why: `needs $${cost}` };
    if (oid && DAY_ORDERS[oid].kind === 'work' && run.injury) return { ok: false, why: 'injured — no work until it heals' };
    if (!ord && s.act === 'ramen' && !Run.mates(run).some(p => p.id === mate)) return { ok: false, why: 'pick a teammate' };
    const bw = !ord && s.act === 'ride' ? City.buyWhy(run, mate) : ''; // the Harbor Market (spec §4.42): mate = 'bike' | 'scooter'
    if (bw) return { ok: false, why: bw };
    const sw = !ord && Secret.acts.includes(s.act) ? Secret.why(run, id, mate) : ''; // a secret place's own rule (mate: the Lighthouse's choice)
    if (sw) return { ok: false, why: sw };
    return { ok: true, why: '' };
  },
  /** Hours at a place (after the walk there): a day order (spec §4.33; h its hours, §4.41), a sleep (h), relax or an outing. Returns the diary line. */
  day(run, id, hard, mate, h) {
    const line = City.dayDo(run, id, hard, mate, h);
    if (line) Gifts.ask(run); // a day may have raised a bond to the gift chance (spec §4.35)
    return line && (SPOTS[id].act !== 'rest' || City.orderOf(id, mate)) ? line + City.upLate(run) : line; // (a sleep ends the day itself)
  },
  dayDo(run, id, hard, mate, h) {
    if (!City.can(run, id, mate, h).ok) return '';
    const oid = City.orderOf(id, mate);
    if (oid) return City.orderDay(run, id, oid, hard, City.hoursAt(id, oid, h));
    if (['ramen', 'arcade', 'street'].includes(SPOTS[id].act)) return City.outing(run, id, mate);
    if (Study.acts.includes(SPOTS[id].act)) return Study.day(run, id); // the tutor / a bookstore (T-230)
    if (Secret.acts.includes(SPOTS[id].act)) return Secret.day(run, id, mate); // a secret place (spec §4.31)
    if (SPOTS[id].act === 'cargo') return City.buyDrone(run, id); // the Ref drone (spec §4.38)
    if (SPOTS[id].act === 'ride') return City.buyRide(run, id, mate); // a bike / a scooter (spec §4.42)
    const s = SPOTS[id],
      cost = City.price(run, id);
    if (s.act === 'rest') {
      const hs = City.hoursAt(id, null, h),
        trip = City.go(run, City.at(run, id), null, 0);
      if (s.hotel) run.money -= cost;
      return `${trip}${s.hotel ? `${s.name} (−$${cost}): ` : ''}${City.sleep(run, hs, s.hotel ? HOTEL.rest : World.restMul(run), s.hotel ? s.name : null)}`;
    }
    const trip = City.arrive(run, id);
    return trip + Training.recreation(run);
  },
  /** The x / skill-point × of an order of h hours at place id: its quality × home turf (kit places) × DAY_GAIN × the hours' units (spec §4.41). */
  orderX: (run, id, h) => (SPOTS[id] && SPOTS[id].kit ? City.mul(run, id) : 1) * DAY_GAIN * Training.units(h),
  /** A day order of h hours at place id (callers checked City.can): pay its price, run it (Training.order); the diary line. */
  orderDay(run, id, oid, hard, h = City.hoursAt(id, oid)) {
    const s = SPOTS[id],
      cost = City.price(run, id, oid, h),
      trip = City.arrive(run, id, oid, h);
    run.money -= cost;
    const inv = City.joins(run, id),
      line = City.withInvite(run, id, () =>
        Training.order(run, oid, id, hard, City.orderX(run, id, h), (s.sand ? SAND_SP : 1) * DAY_GAIN * Training.units(h), h)
      );
    if (s.kit && run.spotQ && run.spotQ[id]) run.spotQ[id].known = true; // quality is never shown (owner, T-172); it still scales EXP
    let w = '';
    if (inv != null) {
      run.enc.inv = null; // an Invite's yes is used up by this order (spec §4.37 7)
      const p = People.find(run, inv),
        b = Run.mates(run).some(m => m.id === inv) ? 0 : Rel.add(run, inv, 'trained'); // (a teammate's bond came with the session)
      w = ` · with ${firstName(p, 'a friend')}${b ? ` (${fmtDelta(b)} bond)` : ''}`;
    }
    return `${trip}${line}${cost ? ` (−$${cost})` : ''}${w}`;
  },
  /** After an action: up past 02:00 you nod off where you stand (spec §4.41). The diary text it adds ('' if not). */
  upLate: run => (City.hour(run) >= DAY.late && !City.night(run) ? City.nod(run) : ''),
  /** Who an Invite brings to a day order at place id (spec §4.37 7): the invited person if the place has a floor (a training key), else null. */
  joins: (run, id) => (SPOTS[id] && SPOTS[id].train ? Encounter.invited(run) : null),
  /**
   * Run fn with the invited person on place id's floor (run.floor[its training key]) and put the floor back after: the order (and
   * its preview on the place card) counts them like a teammate there (§4.33 — EXP × 1.2, the bond, gifts rubbing off).
   */
  withInvite(run, id, fn) {
    const v = City.joins(run, id),
      k = v != null && SPOTS[id].train,
      F = run.floor || (run.floor = {}),
      had = k ? F[k] : null;
    if (!k || (had || []).includes(v)) return fn();
    F[k] = [...(had || []), v];
    try {
      return fn();
    } finally {
      if (had) F[k] = had;
      else delete F[k];
    }
  },
  /** Walk over to map point p (spec §4.37 7: someone you clicked): its walk (0 h when there), nothing of its own. The diary prefix, or null when you can't. */
  walkTo(run, p) {
    if (run.event || !City.onLand(p) || City.outside(run, p) || City.noTime(run, City.trip(run, p), p)) return null;
    return City.go(run, p, null, 0);
  },
  // ---- the Ref drone (spec §4.38, T-339): buy / rent it, the ground under a pickup game -------------------------------------
  /** Your drone: 'own' (bought), 'rent' (a rented one waiting for its match) or '' (none). Lazy `run.drone`. */
  drone: run => (run.drone && run.drone.own ? 'own' : run.drone && run.drone.rent ? 'rent' : ''),
  /** Buy the drone at the Cargo Shed (the day there; callers checked City.can). The diary line. */
  buyDrone(run, id) {
    const trip = City.arrive(run, id);
    run.money -= DRONE.buy;
    run.drone = { own: 1 };
    return `${trip}${SPOTS[id].name}: bought the Ref drone (−$${DRONE.buy}). Pickup games anywhere.`;
  },
  /** Why you can't rent the drone at court C ({ id, at, name }) now ('' if you can): you have one, money, the walk over. */
  rentWhy(run, C) {
    if (City.drone(run)) return City.drone(run) === 'own' ? 'you have your own' : 'rented — play its match first';
    if (run.event) return 'answer the event first';
    if (run.money < DRONE.rent) return `needs $${DRONE.rent}`;
    return City.outside(run, C.at) ? City.fence(run) : City.noTime(run, City.trip(run, C.at), C.at);
  },
  /** Rent the drone at court C for one match (the walk there, no day of its own). The diary line, or '' when you can't. */
  rentDrone(run, C) {
    if (City.rentWhy(run, C)) return '';
    const trip = City.walkTo(run, C.at);
    if (trip == null) return '';
    run.money -= DRONE.rent;
    run.drone = { rent: 1 };
    return `${trip}Rented a Ref drone at ${C.name} (−$${DRONE.rent}) for one match.`;
  },
  /** A field match was played: a rented drone goes back. */
  droneUsed(run) {
    if (City.drone(run) === 'rent') run.drone = null;
  },
  /**
   * The ground at map point p for a pickup game (spec §4.38): { k (GROUNDS key), wind (0–1), name } — or { why } where nobody can
   * play: the sea, water / paddies, the airport, a road, among the buildings, an official venue. Sand on the beach strip; grass in the
   * parks; slope on terraces, the quarry, the fields and Shu's steep ground; asphalt in Wei, the Outlaws' patch, yards and quays;
   * grass elsewhere.
   * Wind by exposure: the beach, open fields, the high ground. Pure.
   */
  groundAt(run, p) {
    if (!City.onLand(p)) return { why: 'in the sea' };
    const G = GROUND.find(q => {
        const d = Math.hypot(p[0] - q.poly.x, p[1] - q.poly.y);
        return d <= q.poly.r && !(q.poly.r0 && d < q.poly.r0);
      }),
      gk = G ? G.kind : '',
      F = PICKUP;
    if (gk === 'water' || gk === 'paddy') return { why: gk === 'water' ? 'in the water' : 'in the paddies' };
    if (MapModel.inAirport(p)) return { why: 'on the airport' };
    const N = ROADS.nodes;
    for (const [a, b, kind] of ROADS.edges) {
      const A = N[a],
        B = N[b],
        dx = B[0] - A[0],
        dy = B[1] - A[1],
        t = clamp(((p[0] - A[0]) * dx + (p[1] - A[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
      if (Math.hypot(p[0] - A[0] - t * dx, p[1] - A[1] - t * dy) < (F.road[kind] || F.road.other)) return { why: 'on the road' };
    }
    if (Object.values(VENUES).some(v => Math.hypot(p[0] - v.at[0], p[1] - v.at[1]) < v.clear)) return { why: 'an official venue' };
    if (MapModel.lots(run).some(l => Math.hypot(p[0] - l.at[0], p[1] - l.at[1]) < l.size * 0.75 + F.lot))
      return { why: 'among the buildings' };
    const reg = City.regionAt(p),
      h = reliefAt(p),
      d = F.step,
      grad =
        Math.hypot(reliefAt([p[0] + d, p[1]]) - reliefAt([p[0] - d, p[1]]), reliefAt([p[0], p[1] + d]) - reliefAt([p[0], p[1] - d])) /
        (2 * d),
      sand = MapModel.onSand(p),
      k = sand
        ? 'sand'
        : gk === 'park'
          ? 'grass'
          : gk === 'terrace' || gk === 'quarry' || gk === 'field'
            ? 'slope'
            : gk === 'yard' || gk === 'quay' || reg === 'wei' || reg === 'outlaws'
              ? 'asphalt'
              : grad > F.slope
                ? 'slope'
                : 'grass',
      wind = sand ? F.wind.beach : gk === 'field' ? F.wind.field : h >= HIGHLAND_M ? clamp(F.wind.high + h / 100, 0, 1) : 0;
    return { k, wind: Math.round(wind * 100) / 100, name: GROUNDS[k].name };
  },
  /** City.go goes here instead while `fn` runs (a road stop's challenge played on the spot, spec §4.38). */
  goOver: null,
  playAt(p, fn) {
    City.goOver = p;
    try {
      return fn();
    } finally {
      City.goOver = null;
    }
  },
  /** A day order at map point p (spec §4.33: Stretch anywhere): { ok, why } like City.can, the hours = the walk + h. */
  pointCan(run, p, oid = 'stretch', h = 1) {
    if (!DAY_ORDERS[oid] || oid !== 'stretch') return { ok: false, why: 'not done here' };
    if (run.event) return { ok: false, why: 'answer the event first' };
    if (!City.onLand(p)) return { ok: false, why: 'in the sea' };
    if (City.outside(run, p)) return { ok: false, why: City.fence(run) };
    const late = City.noTime(run, City.trip(run, p) + h, p);
    return late ? { ok: false, why: late } : { ok: true, why: '' };
  },
  /** Go to map point p and spend h hours there on order oid (Stretch). Returns the diary line ('' if it can't). */
  pointDay(run, p, oid = 'stretch', h = 1) {
    if (!City.pointCan(run, p, oid, h).ok) return '';
    const O = DAY_ORDERS[oid],
      trip = City.go(run, p, { k: 'train', label: O.name, stat: O.main[0], at: REGIONS[City.regionAt(p)].name }, h);
    return `${trip}${Training.order(run, oid, null, false, DAY_GAIN * Training.units(h), DAY_GAIN * Training.units(h), h)}${City.upLate(run)}`;
  },
  /**
   * Go to point p: the walk there (its hours, a 'trip' block), then h hours of `what` (null: just the walk) — today's log (the 24 h
   * strip, spec §4.41) and the map's last action. Returns the walk's diary prefix ('' with no walk).
   */
  go(run, p, what = { k: 'day', label: 'Out' }, h = DAY.act) {
    if (City.goOver) p = City.goOver; // (played on the spot: City.playAt)
    const t = City.trip(run, p),
      from = City.pos(run).slice(),
      h0 = City.hour(run);
    City.pass(run, t, { k: 'trip', label: 'Walk', at: what && what.at });
    if (what) City.pass(run, h, what);
    City.mark(run, h0, t, what ? h : 0);
    City.moveTo(run, p);
    City.note(run, from, h0);
    return t ? `(${City.hrs(t)} walk) ` : '';
  },
  /** The last trip, for the road's encounter (spec §4.37 3; not saved, read at once by the map): { from, to, day (days used before it), hour (its start) }. */
  last: null,
  note(run, from, h0) {
    City.last = { from, to: City.pos(run).slice(), day: City.clock(run).day - 1, hour: h0 };
  },
  /**
   * The second route to map point `to` (spec §4.37 4, T-335): a short cut past what Encounter.vias lists (the hot border's battle,
   * your circle's places) — at most an hour more on foot (§4.41; the walk counted is the safe road's), at most ENC.alt.slack × the safe road's travel cost (or + extra),
   * and only when the safe road doesn't pass it already. { kind, key, at, id?, pts (the road: from → it → to) } or null. Pure.
   */
  alt(run, to) {
    const from = City.pos(run),
      far = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (far < 2 * ENC.min) return null;
    const hrs = cost => (far <= HERE_R ? 0 : Math.max(1, Math.round(cost / WALK_PACE))); // (the short cut's test in whole hours, as before §4.43)
    const safe = City.path(from, to),
      days = hrs(safe.cost),
      max = Math.max(safe.cost * ENC.alt.slack, safe.cost + ENC.alt.extra);
    for (const c of Encounter.vias(run)) {
      if (Encounter.dist(safe.pts, c.at).d <= ENC.r) continue;
      const a = City.path(from, c.at),
        b = City.path(c.at, to),
        cost = a.cost + b.cost,
        d = hrs(cost);
      if (d > days + 1 || cost > max) continue; // (hours, §4.41: an hour more at most — the walk is still the safe road's)
      return { kind: c.kind, key: c.key, at: c.at, id: c.id, pts: [...a.pts, ...b.pts.slice(1)] };
    }
    return null;
  },
  /** The day-track entry for a day at place id (an order: `oid`, or a kit place's lead drill). */
  dayWhat(id, oid) {
    const s = SPOTS[id];
    if (!s) return { k: 'day', label: 'Out' };
    const o = City.orderOf(id, oid);
    if (o) {
      const O = DAY_ORDERS[o];
      return { k: 'train', label: O.name, stat: O.main[0], at: s.name };
    }
    if (s.act === 'rest') return { k: 'sleep', label: 'Sleep', at: s.name };
    if (s.act === 'cargo') return { k: 'outing', label: 'Drone', at: s.name };
    if (s.act === 'ride') return { k: 'outing', label: 'Market', at: s.name };
    if (s.secret) return { k: s.act === 'onsen' ? 'rest' : 'outing', label: SECRET_DAY[s.act] || 'Out', at: s.name };
    if (['ramen', 'arcade', 'street'].includes(s.act)) return { k: 'outing', label: s.act === 'street' ? 'Hustle' : 'Outing', at: s.name };
    return { k: 'rest', label: 'Relax', at: s.name };
  },
  arrive: (run, id, oid, h) => City.go(run, City.at(run, id), City.dayWhat(id, oid), City.hoursAt(id, oid, h)),
  /** An outing (dinner, a night out, street hustle): returns the diary line. */
  outing(run, id, mate) {
    const s = SPOTS[id],
      trip = City.arrive(run, id),
      cost = City.price(run, id),
      out = [];
    if (cost) {
      run.money -= cost;
      out.push(`−$${cost}`);
    }
    if (s.act === 'ramen') out.push(Run.bond(run, mate, undefined, 'hung_out'), Run.bump(run, 'sta', 10));
    else if (s.act === 'arcade') {
      out.push(Run.bump(run, 'mood', 1));
      for (const m of Run.mates(run)) out.push(Run.bond(run, m.id, undefined, 'hung_out'));
    } else if (s.act === 'street') {
      const rival = Math.round(rnd(STREET.rival[0], STREET.rival[1])),
        you = ovr(Run.you(run)),
        win = R() < clamp(0.5 + (you - rival) / 40, 0.1, 0.9);
      out.push(`vs a ${rival}-rated hustler`);
      if (win) {
        const amt = Math.round(rnd(STREET.win[0], STREET.win[1]));
        run.money += amt;
        Rank.points(run, Run.you(run).id, RANK.street.hustle);
        out.push(`won +$${amt}`, Run.bump(run, 'fans', STREET.fans));
        Secret.street(run); // a street contact: the Midnight Court (spec §4.31)
      } else {
        const lost = Math.min(run.money, STREET.loss);
        run.money -= lost;
        out.push(`lost −$${lost}`);
      }
      out.push(Run.bump(run, 'sta', -STREET.sta));
    }
    return `${trip}${s.name}: ${out.filter(Boolean).join(', ') || 'a quiet night'}`;
  },
  /** Hours to just travel to point p (spec §4.41; no 1 h minimum since §4.43; run = faster, RUN_PACE). */
  travelDays: (run, p, how = 'walk') => City.walkH(City.pos(run), p, how === 'run'),
  travelHours: (run, p, how = 'walk') => City.travelDays(run, p, how),
  /** Travel to any point on the island; `how` 'run' (T-309): faster, the route's ground trains you; a TRANSPORT way (spec §4.42): City.rideTo. Returns the diary line. */
  travelTo(run, p, how = 'walk') {
    if (TRANSPORT[how] && TRANSPORT.ways.includes(how)) return City.rideTo(run, p, how);
    const ran = how === 'run',
      t = City.travelDays(run, p, how);
    if (run.event || !City.onLand(p) || City.noTime(run, t, p) || City.outside(run, p) || (ran && City.noRun(run, p))) return '';
    const plan = ran ? City.runPlan(run, p) : null,
      from = City.pos(run).slice(),
      h0 = City.hour(run);
    City.pass(run, t, { k: 'trip', label: ran ? 'Run' : 'Walk' });
    City.mark(run, h0, t, 0);
    City.moveTo(run, p);
    City.note(run, from, h0);
    const where = `${REGIONS[City.loc(run)].name} (${City.hrs(t)})`;
    return `${ran ? `Ran to ${where}: ${Training.runTrip(run, plan)}` : `Walked to ${where}.`}${City.upLate(run)}`;
  },
  // ---- transport (spec §4.42; the numbers: TRANSPORT) ---------------------------------------------------------------------
  /** Do you own ride k ('bike' | 'scooter')? Lazy `run.ride` = { bike: 1, scooter: 1 }. */
  owns: (run, k) => !!(run.ride && run.ride[k]),
  /** Hours on foot from a to b, unrounded (a leg of a mixed trip): the route's cost ÷ WALK_PACE; 0 when there. */
  walkF: (a, b) => (Math.hypot(b[0] - a[0], b[1] - a[1]) <= HERE_R ? 0 : City.path(a, b).cost / WALK_PACE),
  /** A ride's hours: rounded to TRANSPORT.round, TRANSPORT.min at least. */
  rideH: h => Math.max(TRANSPORT.min, Math.round(h / TRANSPORT.round) * TRANSPORT.round),
  /** The next departure at or after hour t on timetable T ({ first, last, every }): { at, off } — off: outside its hours (none left today). */
  depart(T, t) {
    const at = t <= T.first ? T.first : T.first + Math.ceil((t - T.first) / T.every - 1e-9) * T.every;
    return { at, off: at > T.last + 1e-9 };
  },
  /** The bus lines with their travel cost along the line (`cum`, by node index): built once. */
  busLines() {
    if (City._bl) return City._bl;
    const N = ROADS.nodes,
      K = City.edgeKinds();
    return (City._bl = TRANSPORT.bus.lines.map(L => {
      const cum = [0];
      for (let i = 1; i < L.nodes.length; i++) {
        const a = N[L.nodes[i - 1]],
          b = N[L.nodes[i]];
        cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]) * (ROAD_COST[K[`${L.nodes[i - 1]}|${L.nodes[i]}`]] ?? 1));
      }
      return { ...L, cum };
    }));
  },
  /** Every bus stop (ROADS node ids), each once. */
  busStops: () => [...new Set(TRANSPORT.bus.lines.flatMap(L => L.stops))],
  /** A stop's or pier's name for the diary / the card. */
  stopName: id => TRANSPORT.bus.names[id] || (SPOTS[id] && SPOTS[id].name) || id,
  /**
   * The bus from map point o to p leaving at hour h0 (pure): walk to a stop, wait for the next bus, ride (one change at a shared
   * stop at most), walk on — the earliest arrival. { raw (hours), legs [{ m, pts, h, wait, from?, to?, line? }], rides, off } or null.
   */
  busTrip(o, p, h0) {
    const B = TRANSPORT.bus,
      N = ROADS.nodes,
      v = WALK_PACE * B.pace,
      Ls = City.busLines();
    let lab = {};
    for (const s of City.busStops()) lab[s] = { at: s, t: h0 + City.walkF(o, N[s]), n: 0, prev: null };
    for (let n = 1; n <= 2; n++) {
      const nx = { ...lab };
      for (const s of Object.keys(lab)) {
        const S = lab[s];
        if (S.n !== n - 1) continue;
        for (const L of Ls) {
          if (!L.stops.includes(s)) continue;
          const D = City.depart(B, S.t),
            i = L.nodes.indexOf(s);
          for (const t of L.stops) {
            const j = L.nodes.indexOf(t);
            if (t === s) continue;
            const a = D.at + Math.abs(L.cum[j] - L.cum[i]) / v;
            if (!nx[t] || a < nx[t].t - 1e-9) nx[t] = { at: t, t: a, n, prev: S, line: L, dep: D.at, off: D.off || !!S.off, i, j };
          }
        }
      }
      lab = nx;
    }
    let best = null;
    for (const t of Object.keys(lab)) {
      const S = lab[t];
      if (!S.n) continue;
      const arr = S.t + City.walkF(N[t], p);
      if (!best || arr < best.arr - 1e-9) best = { arr, S };
    }
    if (!best) return null;
    const legs = [{ m: 'walk', pts: City.route(N[best.S.at], p), h: best.arr - best.S.t, wait: 0 }];
    let S = best.S;
    for (; S.n; S = S.prev) {
      const ids = S.i <= S.j ? S.line.nodes.slice(S.i, S.j + 1) : S.line.nodes.slice(S.j, S.i + 1).reverse();
      legs.unshift({
        m: 'bus',
        line: S.line.id,
        from: City.stopName(S.prev.at),
        to: City.stopName(S.at),
        pts: ids.map(id => N[id].slice()),
        h: S.t - S.dep,
        wait: S.dep - S.prev.t
      });
    }
    legs.unshift({ m: 'walk', pts: City.route(o, N[S.at]), h: S.t - h0, wait: 0 });
    return { raw: best.arr - h0, legs: legs.filter(l => l.m !== 'walk' || l.h > 0), rides: best.S.n, off: best.S.off };
  },
  /**
   * A bike or a scooter (k) from o to p (pure): the walking route, its road legs ridden at TRANSPORT[k].pace — mountain paths, the
   * legs off the network and everything in Shu walked. { raw, legs, rideH, ridden [{ kind, cost }] } or null (nothing to ride).
   */
  wheelTrip(o, p, k) {
    const T = TRANSPORT[k],
      P = City.path(o, p);
    if (!P.run.length) return null;
    const segs = [],
      ridden = [],
      add = (m, a, b, h) => {
        const L = segs[segs.length - 1];
        if (L && L.m === m) (L.pts.push(b.slice()), (L.h += h));
        else segs.push({ m, pts: [a.slice(), b.slice()], h, wait: 0 });
      };
    let rh = 0;
    add('walk', o, P.run[0].a, City.ground(o, P.run[0].a) / WALK_PACE);
    for (const { a: A, b: B, kind, u, v } of P.run) {
      const cost = Math.hypot(B[0] - A[0], B[1] - A[1]) * (ROAD_COST[kind] ?? 1),
        foot =
          TRANSPORT.foot.includes(kind) ||
          u === 'steps' ||
          v === 'steps' ||
          City.regionAt([(A[0] + B[0]) / 2, (A[1] + B[1]) / 2]) === 'shu'; // Shu's highlands stay on foot (§4.42)
      if (foot) add('walk', A, B, cost / WALK_PACE);
      else {
        const h = cost / (WALK_PACE * T.pace);
        rh += h;
        ridden.push({ kind, cost });
        add(k, A, B, h);
      }
    }
    const end = P.run[P.run.length - 1].b;
    add('walk', end, p, City.ground(end, p) / WALK_PACE);
    if (!ridden.length) return null;
    const legs = segs.filter(l => l.h > 0 || l.m !== 'walk');
    return { raw: legs.reduce((s, l) => s + l.h, 0), legs, rideH: rh, ridden };
  },
  /** The ferry's sea line (map points) and the travel cost along it (`cum`): built once. */
  seaLine() {
    if (City._sea) return City._sea;
    const S = TRANSPORT.ferry.sea,
      cum = [0];
    for (let i = 1; i < S.length; i++) cum.push(cum[i - 1] + Math.hypot(S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1]));
    return (City._sea = { pts: S, cum });
  },
  /** The ferry from o to p leaving at hour h0 (pure): walk to a pier, wait, cross, walk on — the earliest arrival over the pier pairs. */
  ferryTrip(o, p, h0) {
    const F = TRANSPORT.ferry,
      N = ROADS.nodes,
      L = City.seaLine(),
      v = WALK_PACE * F.pace;
    let best = null;
    for (const a of F.piers)
      for (const b of F.piers) {
        if (a === b) continue;
        const w1 = City.walkF(o, N[a.node]),
          D = City.depart(F, h0 + w1),
          ride = Math.abs(L.cum[b.i] - L.cum[a.i]) / v,
          w2 = City.walkF(N[b.node], p),
          arr = D.at + ride + w2;
        if (!best || arr < best.arr - 1e-9) best = { arr, a, b, w1, D, ride, w2 };
      }
    const { a, b, w1, D, ride, w2 } = best,
      sea = a.i <= b.i ? L.pts.slice(a.i, b.i + 1) : L.pts.slice(b.i, a.i + 1).reverse();
    return {
      raw: best.arr - h0,
      legs: [
        { m: 'walk', pts: [...City.route(o, N[a.node]), sea[0].slice()], h: w1, wait: 0 },
        { m: 'ferry', from: a.name, to: b.name, pts: sea.map(q => q.slice()), h: ride, wait: D.at - h0 - w1 },
        { m: 'walk', pts: [sea[sea.length - 1].slice(), ...City.route(N[b.node], p)], h: w2, wait: 0 }
      ],
      off: D.off
    };
  },
  /** A taxi from o to p (pure): both ends in Wei's city, door to door at TRANSPORT.taxi.pace; null elsewhere. */
  taxiTrip(o, p) {
    if (!inPoly(o, CITY.wei) || !inPoly(p, CITY.wei)) return null;
    const raw = City.walkF(o, p) / TRANSPORT.taxi.pace;
    return { raw, legs: [{ m: 'taxi', pts: City.route(o, p), h: raw, wait: 0 }] };
  },
  /** The trips by way, memoised by (way, from, to, hour): they are pure. */
  _wm: new Map(),
  tripOf(k, o, p, h0) {
    const key = `${k}|${o}|${p}|${h0}`;
    if (City._wm.has(key)) return City._wm.get(key);
    if (City._wm.size > 600) City._wm.clear();
    const r =
      k === 'bus'
        ? City.busTrip(o, p, h0)
        : k === 'ferry'
          ? City.ferryTrip(o, p, h0)
          : k === 'taxi'
            ? City.taxiTrip(o, p)
            : City.wheelTrip(o, p, k);
    City._wm.set(key, r);
    return r;
  },
  /**
   * Way k (TRANSPORT) to map point p now (spec §4.42): { k, name, h (hours, the whole trip: walks, waits, the ride), cost ($), why
   * (the gap; '' = go), legs, arrive (hour), gains / sta (the bike's training) } — null when it doesn't serve this trip or isn't
   * faster than walking there. Never picked for you: Travel lists them (City.ways), you choose.
   */
  way(run, p, k) {
    const T = TRANSPORT[k],
      o = City.pos(run),
      h0 = City.hour(run),
      walk = City.trip(run, p);
    if (!T || !TRANSPORT.ways.includes(k) || walk <= TRANSPORT.min || !City.onLand(p)) return null;
    const R0 = City.tripOf(k, o, p, h0);
    if (!R0) return null;
    const h = City.rideH(R0.raw);
    if (h >= walk) return null;
    const B = TRANSPORT.bus,
      rep = City.rep(run, B.region),
      dbl = k === 'bus' ? rep <= B.double : k === 'taxi' && City.rep(run, T.region) <= T.double, // Wei's standing (spec §4.42)
      cost =
        k === 'bus'
          ? R0.rides * B.fare * (dbl ? 2 : 1)
          : k === 'ferry'
            ? T.fare
            : k === 'taxi'
              ? Math.round(T.base + T.perH * (walk - h)) * (dbl ? 2 : 1)
              : k === 'scooter'
                ? T.fuel * Math.max(1, Math.ceil(R0.rideH - 1e-9))
                : 0;
    let gains = null,
      sta = 0;
    if (k === 'bike') {
      const share = TRANSPORT.bike.run,
        c = R0.ridden.reduce((s, l) => s + l.cost, 0);
      gains = {
        end: +(
          R0.ridden.reduce((s, l) => s + ((RUN_GROUND[l.kind] || RUN_GROUND.ground).end || 0) * l.cost, 0) *
          ((HOURS.unit * HOURS.run * share) / TRIP_DAY)
        ).toFixed(2)
      };
      sta = Math.max(1, Math.round((RUN_GROUND.sta * HOURS.staK * c * TRANSPORT.bike.sta) / TRIP_DAY));
    }
    const hhmm = City.hhmm,
      why = run.event
        ? 'answer the event first'
        : City.outside(run, p)
          ? City.fence(run)
          : k === 'bus' && rep <= B.refuse
            ? `Wei's drivers won't take you (standing ${rep})`
            : (k === 'bike' || k === 'scooter') && !City.owns(run, k)
              ? `buy one at the Harbor Market · $${T.price}`
              : R0.off
                ? `the ${k} runs ${hhmm(T.first)}–${hhmm(T.last)}`
                : k === 'bike' && run.injury
                  ? 'injured — walk'
                  : k === 'bike' && run.sta < sta
                    ? `too tired to ride (needs ${sta} stamina)`
                    : City.noTime(run, h, p) || (cost && run.money < cost ? `needs $${cost}` : '');
    return { k, name: T.name, h, cost, why, legs: R0.legs, raw: R0.raw, arrive: h0 + h, gains, sta, dbl };
  },
  /** The ways that serve a trip to p now, in TRANSPORT.ways order (each with its gap). */
  ways: (run, p) => TRANSPORT.ways.map(k => City.way(run, p, k)).filter(Boolean),
  /**
   * Take way k to map point p (callers may skip the checks: refused → ''): pay, the hours pass (one 'trip' block named after the way),
   * the map gets the legs (`run.clock.last.ride` = { k, legs [{ m, pts, w (walk to it from), a, b }] } in week time), you stand at p.
   * The bike trains (a third of a run's Endurance); a bus, ferry or taxi skips the road stops (City.last.ride). The diary line.
   */
  rideTo(run, p, k) {
    const W = City.way(run, p, k);
    if (!W || W.why) return '';
    const from = City.pos(run).slice(),
      h0 = City.hour(run),
      C = City.clock(run),
      f = W.h / (W.raw || W.h),
      r1 = q => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10];
    run.money -= W.cost;
    City.pass(run, W.h, { k: 'trip', label: W.name });
    City.mark(run, h0, W.h, 0);
    let t = 0;
    C.last.ride = {
      k,
      legs: W.legs.map(l => {
        const w = t;
        t += (l.wait || 0) * f;
        const a = t;
        t += l.h * f;
        return { m: l.m, pts: l.pts.map(r1), w: City.wt(run, h0 + w), a: City.wt(run, h0 + a), b: City.wt(run, h0 + t) };
      })
    };
    City.moveTo(run, p);
    City.note(run, from, h0);
    City.last.ride = k;
    const out = [];
    if (k === 'bike') {
      const mul = Training.mul(run, 'run', false, DAY_GAIN);
      for (const s of BODY.keys) if (W.gains[s]) out.push(Training.addXp(run, s, Training.xpFor(s, W.gains[s], mul)));
      out.push(Run.bump(run, 'sta', -W.sta));
      Feel.add(run, 'drive', FEEL.drive.train * HOURS.unit * TRANSPORT.bike.run);
    }
    const verb = { bus: 'Took the bus', bike: 'Biked', scooter: 'Rode the scooter', ferry: 'Took the ferry', taxi: 'Took a taxi' }[k],
      rest = out.filter(Boolean).join(', ');
    return `${verb} to ${REGIONS[City.loc(run)].name} (${City.hrs(W.h)}${W.cost ? `, −$${W.cost}` : ''})${rest ? `: ${rest}` : ''}.${City.upLate(run)}`;
  },
  /** Why you can't buy ride k at the Harbor Market now ('' if you can). */
  buyWhy(run, k) {
    const T = TRANSPORT[k];
    if (k !== 'bike' && k !== 'scooter') return 'pick a bike or a scooter';
    if (City.owns(run, k)) return `you have the ${k}`;
    return run.money < T.price ? `needs $${T.price}` : '';
  },
  /** Buy ride k at the Harbor Market (an hour there; callers checked City.can). The diary line. */
  buyRide(run, id, k) {
    const trip = City.arrive(run, id),
      T = TRANSPORT[k];
    run.money -= T.price;
    (run.ride || (run.ride = {}))[k] = 1;
    return `${trip}${SPOTS[id].name}: bought a ${k} (−$${T.price}). Travel shows ${T.name} on every road trip.`;
  },
  /** The road path from map point `from` to `to` (spec §4.18): the points of City.path. */
  route: (from, to) => City.path(from, to).pts,
  /**
   * The way from map point `from` to `to` (spec §4.18, T-048; joins 2026-10-26): { pts: [from, join, …road nodes…, join, to], cost, ids,
   * run } — each end joins the network at its nearest road point (`City.join`: the nearest point on any drawn road but the overpass,
   * not the nearest node, which may stand behind a building), then the cheapest way over ROADS (Dijkstra on length × ROAD_COST[kind]
   * from the join along its edge to either end; ties broken by node id, so the same call always gives the same path; two joins on one
   * edge may go straight along it). `ids` = the nodes passed, `run` = the road pieces walked [{ a, b, kind, u, v }] (a / b map points,
   * u / v the edge's nodes). `cost` = the cheaper of the legs to / from the joins as ground + the road, or going cross-country
   * (City.ground); the points stay on the roads (you walk them) unless the two ends are nearer each other than to the road. Pure data.
   */
  path(from, to) {
    const key = `${from[0]},${from[1]}>${to[0]},${to[1]}`,
      hit = PATH_CACHE.get(key);
    if (hit) return City.pathCopy(hit);
    if (PATH_CACHE.size > 4000) PATH_CACHE.clear();
    const r = City.pathRaw(from, to);
    PATH_CACHE.set(key, r);
    return City.pathCopy(r);
  },
  pathCopy: r => ({
    pts: r.pts.map(p => p.slice()),
    cost: r.cost,
    ids: r.ids.slice(),
    run: r.run.map(q => ({ ...q, a: q.a.slice(), b: q.b.slice() }))
  }),
  /** The road graph: node id → [[neighbour, length × ROAD_COST]], built once. */
  adj() {
    if (!City._adj) {
      const N = ROADS.nodes,
        A = {};
      for (const [u, v, kind] of ROADS.edges) {
        const w = Math.hypot(N[u][0] - N[v][0], N[u][1] - N[v][1]) * (ROAD_COST[kind] ?? 1);
        (A[u] = A[u] || []).push([v, w]);
        (A[v] = A[v] || []).push([u, w]);
      }
      City._adj = A;
    }
    return City._adj;
  },
  /** ROADS edges a walk joins at (all but the overpass: you get onto it at its ends), with their nodes; built once. */
  joinEdges() {
    if (!City._je) {
      const N = ROADS.nodes;
      City._je = ROADS.edges.filter(e => e[2] !== 'overpass').map(([u, v, kind]) => ({ u, v, kind, A: N[u], B: N[v] }));
    }
    return City._je;
  },
  /**
   * Where map point p joins the road network (2026-10-26): the nearest point `q` on any drawn road but the overpass — { q, d (p → q),
   * u, v, kind, t (0 at u … 1 at v) }; ties go to the first edge in ROADS order. Pure.
   */
  join(p) {
    const key = `${p[0]},${p[1]}`,
      C = City._jc || (City._jc = new Map());
    if (C.has(key)) return C.get(key);
    if (C.size > 4000) C.clear();
    let best = null;
    for (const e of City.joinEdges()) {
      const dx = e.B[0] - e.A[0],
        dy = e.B[1] - e.A[1],
        t = clamp(((p[0] - e.A[0]) * dx + (p[1] - e.A[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1),
        q = [e.A[0] + t * dx, e.A[1] + t * dy],
        d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (!best || d < best.d - 1e-9) best = { q, d, u: e.u, v: e.v, kind: e.kind, t };
    }
    C.set(key, best);
    return best;
  },
  pathRaw(from, to) {
    const N = ROADS.nodes,
      d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]),
      ja = City.join(from),
      jb = City.join(to),
      straight = { pts: [from.slice(), to.slice()], cost: City.ground(from, to), ids: [], run: [] };
    if (d(from, to) <= ja.d && d(from, to) <= jb.d) return straight;
    const adj = City.adj(),
      extra = {},
      wOf = (a, b, kind) => d(a, b) * (ROAD_COST[kind] ?? 1),
      link = (u, v, w) => {
        (extra[u] = extra[u] || []).push([v, w]);
        (extra[v] = extra[v] || []).push([u, w]);
      };
    // the two joins as nodes '<a' / '>b' on their edges (sorted before every node id: ties stay as before)
    const A = '<a',
      B = '>b',
      P = { [A]: ja.q, [B]: jb.q };
    link(A, ja.u, wOf(ja.q, N[ja.u], ja.kind));
    link(A, ja.v, wOf(ja.q, N[ja.v], ja.kind));
    link(B, jb.u, wOf(jb.q, N[jb.u], jb.kind));
    link(B, jb.v, wOf(jb.q, N[jb.v], jb.kind));
    const same = (ja.u === jb.u && ja.v === jb.v) || (ja.u === jb.v && ja.v === jb.u);
    if (same) link(A, B, wOf(ja.q, jb.q, ja.kind));
    // Dijkstra on a binary heap ordered by (distance, id): the same order as scanning the ids sorted (the joins first)
    const at = id => P[id] || N[id],
      dist = { [A]: 0 },
      prev = {},
      done = new Set(),
      H = [[0, A]],
      less = (x, y) => x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]),
      push = e => {
        let i = H.push(e) - 1;
        while (i && less(H[i], H[(i - 1) >> 1])) {
          const j = (i - 1) >> 1;
          [H[i], H[j]] = [H[j], H[i]];
          i = j;
        }
      },
      pop = () => {
        const top = H[0],
          last = H.pop();
        if (H.length) {
          H[0] = last;
          for (let i = 0; ;) {
            const l = 2 * i + 1,
              r = l + 1;
            let m = i;
            if (l < H.length && less(H[l], H[m])) m = l;
            if (r < H.length && less(H[r], H[m])) m = r;
            if (m === i) break;
            [H[i], H[m]] = [H[m], H[i]];
            i = m;
          }
        }
        return top;
      };
    while (H.length) {
      const [du, u] = pop();
      if (done.has(u) || du !== dist[u]) continue;
      if (u === B) break;
      done.add(u);
      for (const list of [adj[u], extra[u]])
        for (const [v, w] of list || []) {
          const nd = dist[u] + w;
          if (dist[v] == null || nd < dist[v] - 1e-9 || (Math.abs(nd - dist[v]) <= 1e-9 && u < prev[v])) {
            const better = dist[v] == null || nd < dist[v];
            ((dist[v] = nd), (prev[v] = u));
            if (better || !done.has(v)) push([nd, v]);
          }
        }
    }
    if (dist[B] == null) return straight; // (not connected: cannot happen with ROADS as shipped)
    const cost = Math.min(straight.cost, City.ground(from, ja.q) + dist[B] + City.ground(jb.q, to));
    const chain = [];
    for (let id = B; id !== undefined; id = prev[id]) chain.unshift(id);
    const kinds = City.edgeKinds(),
      edgeOf = (x, y) => {
        if (!P[x] && !P[y]) return { kind: kinds[`${x}|${y}`], u: x, v: y };
        const J = P[x] ? (x === A ? ja : jb) : y === A ? ja : jb;
        return { kind: J.kind, u: J.u, v: J.v };
      },
      run = [];
    for (let i = 1; i < chain.length; i++) {
      const a = at(chain[i - 1]),
        b = at(chain[i]);
      if (d(a, b) > 1e-9) run.push({ a: a.slice(), b: b.slice(), ...edgeOf(chain[i - 1], chain[i]) });
    }
    const pts = [from, ...chain.map(at), to].filter((p, i, Q) => !i || d(p, Q[i - 1]) > 1e-9);
    return { pts: pts.map(p => p.slice()), cost, ids: chain.filter(id => !P[id]), run };
  },
  /**
   * The route from `from` to `to` as legs of ground (spec §4.33, T-309): [{ kind, cost }] — each road piece walked (its ROADS kind;
   * an edge at the Thousand Steps node: 'steps') and the cross-country legs to / from the network ('ground'), with its travel cost.
   */
  legs(from, to) {
    const P = City.path(from, to),
      out = [];
    if (!P.run.length) return [{ kind: 'ground', cost: City.ground(from, to) }];
    out.push({ kind: 'ground', cost: City.ground(from, P.run[0].a) });
    for (const q of P.run)
      out.push({
        kind: q.u === 'steps' || q.v === 'steps' ? 'steps' : q.kind || 'ground',
        cost: Math.hypot(q.b[0] - q.a[0], q.b[1] - q.a[1]) * (ROAD_COST[q.kind] ?? 1)
      });
    out.push({ kind: 'ground', cost: City.ground(P.run[P.run.length - 1].b, to) });
    return out.filter(l => l.cost > 0);
  },
  /** ROADS edge kinds by 'u|v' (both ways), built once. */
  edgeKinds() {
    if (!City._ek) {
      City._ek = {};
      for (const [u, v, k] of ROADS.edges) City._ek[`${u}|${v}`] = City._ek[`${v}|${u}`] = k;
    }
    return City._ek;
  },
  /**
   * Running to map point p (T-309): { gains: { body stat: base units }, sta, days (its hours, §4.41) } — RUN_GROUND per TRIP_DAY of each
   * leg's travel cost × HOURS.unit (as a drill: a 2 h session's worth); stamina RUN_GROUND.sta × HOURS.staK per TRIP_DAY of it (≥ 1 when it moves). Pure.
   */
  runPlan(run, p) {
    const gains = {};
    let c = 0;
    for (const l of City.legs(City.pos(run), p)) {
      c += l.cost;
      for (const [k, v] of Object.entries(RUN_GROUND[l.kind] || RUN_GROUND.ground))
        gains[k] = (gains[k] || 0) + (v * l.cost * HOURS.unit * HOURS.run) / TRIP_DAY;
    }
    for (const k of Object.keys(gains)) gains[k] = +gains[k].toFixed(2);
    return {
      gains,
      sta: c > 0 ? Math.max(1, Math.round((RUN_GROUND.sta * HOURS.staK * c) / TRIP_DAY)) : 0,
      days: City.travelDays(run, p, 'run')
    };
  },
  /** Why you can't run to p ('' if you can): it must move you, and you need the stamina (too tired → walk only). */
  noRun(run, p) {
    const R0 = City.runPlan(run, p);
    if (!R0.sta) return 'nowhere to run';
    if (run.injury) return 'injured — walk';
    return run.sta < R0.sta ? `too tired to run (needs ${R0.sta} stamina) — walk` : '';
  },
  /** Cross-country cost from a to b: the distance, each GROUND_STEP-long stretch × GROUND_COST of the region at its middle × the climb (reliefAt). */
  ground(a, b) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]),
      n = Math.max(1, Math.ceil(L / GROUND_STEP));
    let c = 0;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      c += (L / n) * (GROUND_COST[City.regionAt(p)] ?? 1) * (1 + reliefAt(p) / RELIEF_COST); // climbing the Peak / Spine costs more
    }
    return c;
  },
  /** Hours to scout club ti: the walk to its HQ + DAY.act. */
  scoutCost: (run, ti) => City.trip(run, CITY.hq[ti]) + DAY.act,
  /** A day at a club HQ: scout them (roster, elements, a rumour). Returns the diary line. */
  scout(run, ti) {
    if (run.event || !run.teams[ti] || City.noTime(run, City.scoutCost(run, ti), CITY.hq[ti]) || City.outside(run, CITY.hq[ti])) return '';
    const t = run.teams[ti],
      f = FACTIONS[ti],
      trip = City.go(run, CITY.hq[ti], { k: 'scout', label: 'Scout', at: t.name });
    (run.scout || (run.scout = {}))[ti] = run.week;
    Run.news(run, `Word on the street about ${f.name}: ${f.dark}.`); // voice: rumor
    return `${trip}Scouted ${t.name}: rating ${t.ovr}, ${squadOf(t).filter(p => p.elOn).length} element user(s). ${Run.bump(run, 'sta', -SCOUT_STA)}${City.upLate(run)}`;
  },
  scouted: (run, ti) => !!(run.scout && run.scout[ti] != null),
  /** Standing with a region's clubs (−100…100). */
  rep: (run, r) => (run.rep && run.rep[r]) || 0,
  repBump(run, r, d) {
    const R0 = run.rep || (run.rep = {}),
      v0 = R0[r] || 0;
    R0[r] = clamp(v0 + d, -100, 100);
    const n = R0[r] - v0;
    return n ? `${fmtDelta(n)} standing with ${REGIONS[r].name}` : '';
  }
};
