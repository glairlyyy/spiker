// The island map phase of a training week: 7 days to spend. Every action (train, rest, relax, an outing, scouting a
// club HQ) takes a day, plus the trip there: by map distance (City.trip, at most TRIP_MAX days). You can also just
// walk to any point of the island. The map is dark where you haven't been (run.fog: points you've stood on, each
// revealing REVEAL_R around it). Nothing may spill into next week; the week ends only when the player ends it.
// Places belong to regions (REGIONS): the region sets the price and the quality; Wei's premium places may turn out
// overhyped and Shu's rough ones may be hidden gems (rolled per run, found out by training there). DOM-free.

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
  region: (run, id) => (run.own && run.own[id]) || SPOTS[id].region || (HOUSING[run.housing] || HOUSING.studio).region || 'open',
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
  pos: run => (Array.isArray(run.pos) ? run.pos : (REGIONS[run.loc] || REGIONS.wu).at),
  /** The region you are in. */
  loc: run => City.regionAt(City.pos(run)),
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
    for (const r of ['wu', 'wei', 'shu']) if (inPoly([x, y], CITY[r])) return r;
    return 'open';
  },
  /** On the island? */
  onLand: p => inPoly(p, CITY.coast),
  /** Travel days from where you are to point p: 0 close by, then one per TRIP_DAY map units, at most TRIP_MAX. */
  trip(run, p) {
    const [x, y] = City.pos(run),
      d = Math.hypot(p[0] - x, p[1] - y);
    return d <= NEAR_R ? 0 : Math.min(TRIP_MAX, Math.ceil(d / TRIP_DAY));
  },
  /** Stand at p (you've spent the days): the fog lifts around it. */
  moveTo(run, p) {
    run.pos = [Math.round(p[0]), Math.round(p[1])];
    run.loc = City.regionAt(run.pos);
    City.reveal(run, run.pos);
  },
  reveal(run, p) {
    const F = run.fog || (run.fog = []);
    if (!F.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 30)) F.push([Math.round(p[0]), Math.round(p[1])]);
  },
  /** Explored: near a point you've stood on. */
  seen: (run, p) => (run.fog || []).some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) <= REVEAL_R),
  /** Your home region (where you live). */
  homeRegion: run => City.region(run, 'home'),
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
    if (['ramen', 'arcade', 'street'].includes(SPOTS[id].act)) return City.evening(run, id, mate);
    const s = SPOTS[id],
      cost = City.price(run, id),
      out = [];
    let line;
    if (s.train) {
      run.money -= cost;
      const Q = City.quality(run, id);
      line = Training.train(run, s.train, hard, City.mul(run, id) * DAY_GAIN, (s.sand ? SAND_SP : 1) * DAY_GAIN);
      if (!Q.known && run.spotQ && run.spotQ[id]) {
        run.spotQ[id].known = true;
        if (Q.tag === 'overhyped') out.push(`${s.name} turned out overhyped — just average for the price`);
        else if (Q.tag === 'gem') out.push(`${s.name} is a hidden gem — top quality for next to nothing!`);
        else
          out.push(
            `${s.name}: ${REGIONS[s.region].kind === 'major' && REGIONS[s.region].hype ? 'worth every penny' : 'as rough as it looks'}`
          );
      }
      line = `${line} (−$${cost})${out.length ? ' · ' + out.join('; ') : ''}`;
    } else if (s.act === 'rest') {
      if (s.hotel) run.money -= cost;
      line = `${s.hotel ? `${s.name} (−$${cost}): ` : ''}${Training.rest(run, s.hotel ? HOTEL.rest : null)}`;
    } else line = Training.recreation(run);
    return City.arrive(run, id) + line;
  },
  /** Go to point p, spending the trip + a day there; returns the trip's diary prefix. */
  go(run, p) {
    const t = City.trip(run, p);
    City.spend(run, t + 1);
    City.moveTo(run, p);
    return t ? `(${t}-day trip) ` : '';
  },
  arrive: (run, id) => City.go(run, City.at(run, id)),
  /** An outing (dinner, a night out, street hustle): returns the diary line. */
  evening(run, id, mate) {
    const s = SPOTS[id],
      trip = City.arrive(run, id),
      cost = City.price(run, id),
      out = [];
    if (cost) {
      run.money -= cost;
      out.push(`−$${cost}`);
    }
    if (s.act === 'ramen') out.push(Run.bond(run, mate, 6), Run.bump(run, 'sta', 10));
    else if (s.act === 'arcade') {
      out.push(Run.bump(run, 'mood', 1));
      for (const m of Run.mates(run)) out.push(Run.bond(run, m.id, 3));
    } else if (s.act === 'street') {
      const rival = Math.round(rnd(STREET.rival[0], STREET.rival[1])),
        you = ovr(Run.you(run)),
        win = R() < clamp(0.5 + (you - rival) / 40, 0.1, 0.9);
      out.push(`vs a ${rival}-rated hustler`);
      if (win) {
        const amt = Math.round(rnd(STREET.win[0], STREET.win[1]));
        run.money += amt;
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
    City.moveTo(run, p);
    return `Travelled to ${REGIONS[City.loc(run)].name} (${t} day${t > 1 ? 's' : ''}).`;
  },
  /** Days to scout club ti: the trip to its HQ + a day. */
  scoutCost: (run, ti) => City.trip(run, CITY.hq[ti]) + 1,
  /** A day at a club HQ: scout them (roster, elements, a rumour). Returns the diary line. */
  scout(run, ti) {
    if (run.event || !run.teams[ti] || City.noTime(run, City.scoutCost(run, ti))) return '';
    const t = run.teams[ti],
      f = FACTIONS[ti],
      trip = City.go(run, CITY.hq[ti]);
    (run.scout || (run.scout = {}))[ti] = run.week;
    Run.news(run, `Rumour from ${f.name}: ${f.dark.toLowerCase()}.`);
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
    return n ? `${n > 0 ? '+' : '−'}${Math.abs(n)} standing with ${REGIONS[r].name}` : '';
  },
  /** A training week may open with a street battle: an aggressor raids a neighbour (run.clash, over at the week's end). */
  clashRoll(run) {
    run.clash = null;
    const wt = Run.weekType(run);
    if ((wt !== 'train' && wt !== 'camp') || R() >= CLASH.chance) return;
    const { att, def } = Front.pick(run),
      site = CLASH.sites.findIndex(s => (s.a === att && s.b === def) || (s.a === def && s.b === att));
    run.clash = { site, att, seen: false, done: false };
  },
  /** A battle nobody joined is settled at the week's end. Returns the diary line. */
  clashEnd(run) {
    const c = City.clashSite(run);
    if (!c) return '';
    run.clash.done = true;
    const w = Front.sim(run, c.a, c.b, run.clash.att),
      l = w === c.a ? c.b : c.a,
      s = Front.result(run, w, l);
    return `Street battle: ${REGIONS[w].name} beat ${REGIONS[l].name}${s ? ` — ${s}` : ''}.`;
  },
  clashSite: run => (run.clash && !run.clash.done ? CLASH.sites[run.clash.site] : null),
  clashCost: run => City.trip(run, City.clashSite(run).at) + 1,
  /** Fight's win chance. */
  clashP: run => clamp(0.5 + (ovr(Run.you(run)) - CLASH.par) / 40, 0.2, 0.85),
  /** Go to the battle: watch (side null) or fight for side (a region). Returns the diary line. */
  clash(run, side) {
    const c = City.clashSite(run);
    if (!c || run.event || City.noTime(run, City.clashCost(run)) || (side && side !== c.a && side !== c.b)) return '';
    const trip = City.go(run, c.at),
      out = [];
    run.clash.done = true;
    const vs = `${REGIONS[c.a].name} vs ${REGIONS[c.b].name}`;
    if (!side) {
      for (const t of run.teams) if ([c.a, c.b].includes(FACTIONS[t.i].region)) (run.scout || (run.scout = {}))[t.i] = run.week;
      const w = Front.sim(run, c.a, c.b, run.clash.att),
        s = Front.result(run, w, w === c.a ? c.b : c.a);
      out.push(Run.bump(run, 'sta', -CLASH.watchSta));
      return `${trip}Watched the street battle (${vs}): ${REGIONS[w].name} won${s ? ` — ${s}` : ''}; both sides' clubs scouted. ${out.filter(Boolean).join(', ')}`;
    }
    const foe = side === c.a ? c.b : c.a,
      win = R() < City.clashP(run),
      s = Front.result(run, win ? side : foe, win ? foe : side);
    out.push(City.repBump(run, side, win ? CLASH.win : CLASH.lose), City.repBump(run, foe, CLASH.other), Run.bump(run, 'sta', -CLASH.sta));
    if (win) out.push(Run.bump(run, 'fans', CLASH.fans));
    // the fight itself is experience: a flat amount for your key stat, scaled by how strong the fight was against you
    const f = Growth.gapFactor(ovr(Run.you(run)), CLASH.par);
    out.push(
      Training.addXp(run, KEYSTAT[Run.you(run).role], Math.round(MATCH_XP.clash[win ? 'win' : 'loss'] * f), 'match') + Growth.gapNote(f)
    );
    return `${trip}Fought for ${REGIONS[side].name} in the street battle — ${win ? 'won' : 'lost'}: ${out.filter(Boolean).join(', ')}${s ? `. ${s}!` : ''}`;
  }
};
