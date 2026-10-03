// The island map phase of a training week: 7 days to spend. Every action (train, rest, relax, an outing, scouting a
// club HQ) takes a day, plus the trip there: by map distance (City.trip, at most TRIP_MAX days). You can also just
// walk to any point of the island. The map is dark where you haven't been (run.fog: points you've stood on, each
// revealing REVEAL_R around it). Nothing may spill into next week; the week ends only when the player ends it.
// Places belong to regions (REGIONS): the region sets the price and the quality; Wei's premium places may turn out
// overhyped and Shu's rough ones may be hidden gems (rolled per run, found out by training there). DOM-free.

/** City.path results by end points (pure, so safe to keep; ROADS never changes at run time). */
const PATH_CACHE = new Map();
const City = {
  /** Days left this week (night falls at 0: only End week remains). */
  days: run => (Number.isFinite(run.days) ? run.days : WEEK_DAYS),
  night: run => City.days(run) <= 0,
  /** Days an action at a place takes: the trip there + a day there. */
  cost: (run, id) => City.trip(run, City.at(run, id)) + 1,
  /** Spend days (callers checked they fit). */
  spend(run, n) {
    run.days = Math.max(0, City.days(run) - n);
  },
  /** Why n days don't fit ('' if they do). */
  noTime(run, n) {
    const d = City.days(run);
    return n <= d ? '' : d ? `takes ${n} day${n > 1 ? 's' : ''} — only ${d} left this week` : 'no days left — end the week';
  },
  /** Region of a place (home: where you live). */
  region: (run, id) => Front.owner(run, id) || (HOUSING[run.housing] || HOUSING.studio).region || 'open',
  /** Map position of a place (home moves with your housing). */
  at: (run, id) => (SPOTS[id].at ? SPOTS[id].at : HOME_AT[run.housing] || HOME_AT.studio),
  /** The training places for a key. */
  spotsFor: key => Object.keys(SPOTS).filter(id => SPOTS[id].train === key),
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
  /** Money for a session / outing / hotel night at a place (0 at home and in the park). */
  price(run, id) {
    const s = SPOTS[id],
      r = City.region(run, id),
      p = ((REGIONS[r] || REGIONS.open).price || 1) * Front.priceMul(run, r);
    if (s.train) return Math.round(TRAIN_FEE * p);
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
    if (Math.hypot(x - CITY.park.x, y - CITY.park.y) <= CITY.park.r) return 'open';
    for (const r of MAJORS) if (inPoly([x, y], CITY[r])) return r;
    return 'open';
  },
  /** On the island? */
  onLand: p => inPoly(p, CITY.coast),
  /** Travel days from where you are to point p: 0 close by, then one per TRIP_DAY units of travel cost (City.path), at most TRIP_MAX. */
  trip(run, p) {
    const from = City.pos(run);
    return Math.hypot(p[0] - from[0], p[1] - from[1]) <= NEAR_R ? 0 : Math.min(TRIP_MAX, Math.ceil(City.path(from, p).cost / TRIP_DAY));
  },
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
  /** After any action on the map: the week's one event is rolled after its first action. */
  after(run) {
    if (!run.rolled) {
      run.rolled = true;
      Events.roll(run);
    }
  },
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
  /** Can you do this now? { ok, why }. */
  can(run, id, mate) {
    const s = SPOTS[id];
    if (!s) return { ok: false, why: 'unknown place' };
    if (run.event) return { ok: false, why: 'answer the event first' };
    const acc = City.access(run, id);
    if (!acc.ok) return acc;
    const late = City.noTime(run, City.cost(run, id));
    if (late) return { ok: false, why: late };
    const cost = City.price(run, id);
    if (cost && run.money < cost) return { ok: false, why: `needs $${cost}` };
    if (s.act === 'ramen' && !Run.mates(run).some(p => p.id === mate)) return { ok: false, why: 'pick a teammate' };
    return { ok: true, why: '' };
  },
  /** A day at a place (after the trip there): train, rest, relax or an outing. Returns the diary line. */
  day(run, id, hard, mate) {
    if (!City.can(run, id, mate).ok) return '';
    if (['ramen', 'arcade', 'street'].includes(SPOTS[id].act)) return City.outing(run, id, mate);
    const s = SPOTS[id],
      cost = City.price(run, id),
      out = [];
    let line;
    if (s.train) {
      run.money -= cost;
      const Q = City.quality(run, id);
      line = Training.train(run, s.train, hard, City.mul(run, id) * DAY_GAIN, (s.sand ? SAND_SP : 1) * DAY_GAIN);
      if (!Q.known && run.spotQ && run.spotQ[id]) run.spotQ[id].known = true; // quality is never shown (owner, T-172); it still scales EXP
      line = `${line} (−$${cost})${out.length ? ' · ' + out.join('; ') : ''}`;
    } else if (s.act === 'rest') {
      if (s.hotel) run.money -= cost;
      line = `${s.hotel ? `${s.name} (−$${cost}): ` : ''}${Training.rest(run, s.hotel ? HOTEL.rest : null)}`;
    } else line = Training.recreation(run);
    return City.arrive(run, id) + line;
  },
  /**
   * Go to point p, spending the trip + a day there; returns the trip's diary prefix. `what` = the day's entry for the
   * week's day track (run.dayLog, spec §10.2): { k, label, stat? }; trip days are logged as { k: 'trip' } before it.
   */
  go(run, p, what = { k: 'day', label: 'Out' }) {
    const t = City.trip(run, p);
    City.spend(run, t + 1);
    City.logDays(run, t, what);
    City.moveTo(run, p);
    return t ? `(${t}-day trip) ` : '';
  },
  /** Append to the day track: `trips` trip days, then one day of `what` (null: trips only). Display only. */
  logDays(run, trips, what) {
    const L = run.dayLog || (run.dayLog = []);
    for (let i = 0; i < trips; i++) L.push({ k: 'trip', label: 'Trip' });
    if (what) L.push(what);
  },
  /** The day-track entry for a day at place id. */
  dayWhat(id) {
    const s = SPOTS[id];
    if (!s) return { k: 'day', label: 'Out' };
    if (s.train) return { k: 'train', label: STATNAME[TRAININGS[s.train].main[0]], stat: TRAININGS[s.train].main[0], at: s.name };
    if (s.act === 'rest') return { k: 'rest', label: 'Rest', at: s.name };
    if (['ramen', 'arcade', 'street'].includes(s.act)) return { k: 'outing', label: s.act === 'street' ? 'Hustle' : 'Outing', at: s.name };
    return { k: 'rest', label: 'Relax', at: s.name };
  },
  arrive: (run, id) => City.go(run, City.at(run, id), City.dayWhat(id)),
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
      } else {
        const lost = Math.min(run.money, STREET.loss);
        run.money -= lost;
        out.push(`lost −$${lost}`);
      }
      out.push(Run.bump(run, 'sta', -STREET.sta));
    }
    return `${trip}${s.name}: ${out.filter(Boolean).join(', ') || 'a quiet night'}`;
  },
  /** Days to just travel to point p (at least one). */
  travelDays: (run, p) => Math.max(1, City.trip(run, p)),
  /** Travel to any point on the island. Returns the diary line. */
  travelTo(run, p) {
    const t = City.travelDays(run, p);
    if (run.event || !City.onLand(p) || City.noTime(run, t)) return '';
    City.spend(run, t);
    City.logDays(run, t, null);
    City.moveTo(run, p);
    return `Travelled to ${REGIONS[City.loc(run)].name} (${t} day${t > 1 ? 's' : ''}).`;
  },
  /** The road path from map point `from` to `to` (spec §4.18): the points of City.path. */
  route: (from, to) => City.path(from, to).pts,
  /**
   * The way from map point `from` to `to` (spec §4.18, T-048): { pts: [from, …road nodes…, to], cost } — the nearest node to each end,
   * the cheapest way between them over ROADS (Dijkstra on length × ROAD_COST[kind]; ties broken by node id, so the same call always
   * gives the same path), the legs to / from the network as ground. `cost` is the cheaper of that and going cross-country (City.ground);
   * the points stay on the roads (you walk them) unless the two ends are nearer each other than to any node. Pure data, no randoms.
   */
  path(from, to) {
    const key = `${from[0]},${from[1]}>${to[0]},${to[1]}`,
      hit = PATH_CACHE.get(key);
    if (hit) return { pts: hit.pts.map(p => p.slice()), cost: hit.cost };
    if (PATH_CACHE.size > 4000) PATH_CACHE.clear();
    const r = City.pathRaw(from, to);
    PATH_CACHE.set(key, r);
    return { pts: r.pts.map(p => p.slice()), cost: r.cost };
  },
  pathRaw(from, to) {
    const N = ROADS.nodes,
      ids = Object.keys(N).sort(),
      d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]),
      near = p => ids.reduce((best, id) => (d(p, N[id]) < d(p, N[best]) ? id : best), ids[0]),
      a = near(from),
      b = near(to),
      straight = { pts: [from.slice(), to.slice()], cost: City.ground(from, to) };
    if (d(from, to) <= d(from, N[a]) && d(from, to) <= d(to, N[b])) return straight;
    const adj = {};
    for (const [u, v, kind] of ROADS.edges) {
      const w = d(N[u], N[v]) * (ROAD_COST[kind] ?? 1);
      (adj[u] = adj[u] || []).push([v, w]);
      (adj[v] = adj[v] || []).push([u, w]);
    }
    const dist = { [a]: 0 },
      prev = {},
      done = new Set();
    for (;;) {
      let u = null;
      for (const id of ids) if (!done.has(id) && dist[id] != null && (u === null || dist[id] < dist[u])) u = id;
      if (u === null || u === b) break;
      done.add(u);
      for (const [v, w] of adj[u] || []) {
        const nd = dist[u] + w;
        if (dist[v] == null || nd < dist[v] - 1e-9 || (Math.abs(nd - dist[v]) <= 1e-9 && u < prev[v])) ((dist[v] = nd), (prev[v] = u));
      }
    }
    if (dist[b] == null) return straight; // (not connected: cannot happen with ROADS as shipped)
    const cost = Math.min(straight.cost, City.ground(from, N[a]) + dist[b] + City.ground(N[b], to));
    const path = [];
    for (let id = b; id !== undefined; id = prev[id]) path.unshift(id);
    const pts = [from, ...path.map(id => N[id]), to].filter((p, i, A) => !i || p[0] !== A[i - 1][0] || p[1] !== A[i - 1][1]);
    return { pts: pts.map(p => p.slice()), cost };
  },
  /** Cross-country cost from a to b: the distance, each GROUND_STEP-long stretch × GROUND_COST of the region at its middle. */
  ground(a, b) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]),
      n = Math.max(1, Math.ceil(L / GROUND_STEP));
    let c = 0;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      c += (L / n) * (GROUND_COST[City.regionAt([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])] ?? 1);
    }
    return c;
  },
  /** Days to scout club ti: the trip to its HQ + a day. */
  scoutCost: (run, ti) => City.trip(run, CITY.hq[ti]) + 1,
  /** A day at a club HQ: scout them (roster, elements, a rumour). Returns the diary line. */
  scout(run, ti) {
    if (run.event || !run.teams[ti] || City.noTime(run, City.scoutCost(run, ti))) return '';
    const t = run.teams[ti],
      f = FACTIONS[ti],
      trip = City.go(run, CITY.hq[ti], { k: 'scout', label: 'Scout', at: t.name });
    (run.scout || (run.scout = {}))[ti] = run.week;
    Run.news(run, `Word on the street about ${f.name}: ${f.dark}.`); // voice: rumor
    return `${trip}Scouted ${t.name}: rating ${t.ovr}, ${squadOf(t).filter(p => p.elOn).length} element user(s). ${Run.bump(run, 'sta', -SCOUT_STA)}`;
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
