// Faction dynamics between the three majors (spec §4.34): each week's street battle is fought on one border between two war
// units (js/career/war.js) and moves their Strength — no tile changes hands. Strength drives the economy: prices, facility
// quality, club joins. Who starts a fight: FRONT.aggro (+ revenge), whom it goes for: FRONT.prey. DOM-free.

const Front = {
  /** Who holds a place now (a destroyed unit's places go to its destroyer; run.own caches the changes — War.sync). */
  owner: (run, id) => (run.own && run.own[id]) || SPOTS[id].region,
  seized: (run, id) => !!(SPOTS[id] && SPOTS[id].region && Front.owner(run, id) !== SPOTS[id].region),
  /** Places a region lost / took. */
  lostIds: (run, r) => Object.keys(run.own || {}).filter(id => SPOTS[id].region === r && run.own[id] !== r),
  takenIds: (run, r) => Object.keys(run.own || {}).filter(id => run.own[id] === r && SPOTS[id].region !== r),
  /** A major still in the war: one of its units stands. */
  standing: (run, r) => War.ofRegion(r).some(u => War.alive(run, u)),
  /** Region r shaken by the war: one of its units is Strained or worse. */
  weak: (run, r) => War.ofRegion(r).some(u => War.stage(run, u) > 0),
  /** Prices × (1 + WAR.price per point of Strength under 100), facility quality × (q0 + q1 × Strength / 100) — majors only. */
  priceMul: (run, r) => (MAJORS.includes(r) ? 1 + WAR.price * (WAR.start - War.regionStr(run, r)) : 1),
  qMul: (run, r) => (MAJORS.includes(r) ? WAR.q[0] + (WAR.q[1] * War.regionStr(run, r)) / 100 : 1),
  /** a's edge over b: a's Strength minus b's (region means). */
  meter: (run, a, b) => War.regionStr(run, a) - War.regionStr(run, b),
  /**
   * Where att raids def this week: a border between their touching units (a hash of the week picks the pair, then the
   * edge) → { tile (def's), from (att's), at (the edge's midpoint), ua, ud }; null when their land doesn't touch.
   */
  site(run, att, def, salt = '') {
    const P = War.pairs(run, att, def);
    if (!P.length) return null;
    const h = s => hstr(`${Season.wk(run)}|${att}|${def}|${s}${salt}`),
      [ua, ud] = P[Math.floor(h('pair') * P.length)],
      E = War.edges(run, ua, ud),
      e = E[Math.floor(h('edge') * E.length)],
      a = Hex.tile(e.tile).at,
      b = Hex.tile(e.from).at;
    return { tile: e.tile, from: e.from, at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], ua, ud };
  },
  /** This week's battle's units (open or fought): { a: raider, b: defender, ua, ub } from run.clash's tiles, or null. */
  clash(run) {
    const c = run.clash;
    if (!c || !c.tile || !Hex.tile(c.tile)) return null;
    const ua = c.ua || (c.from && War.unitAt(run, c.from)),
      ub = c.ud || War.unitAt(run, c.tile);
    return ua && ub ? { a: c.att, b: c.def, ua, ub } : null;
  },
  /** The units of this week's battle when it is w vs l, else w's and l's first touching pair: [unit of w, unit of l] or null. */
  units(run, w, l) {
    const c = Front.clash(run);
    if (c && [c.a, c.b].includes(w) && [c.a, c.b].includes(l)) return w === c.a ? [c.ua, c.ub] : [c.ub, c.ua];
    return War.pairs(run, w, l)[0] || null;
  },
  /** Street strength in a battle nobody decides for them: 50 + WAR.sim × (the unit's Strength − 100). */
  strength: (run, u) => 50 + WAR.sim * (War.str(run, u) - WAR.start),
  /** A battle nobody joined (att = the raider, who has the initiative). */
  sim(run, a, b, att) {
    const U = Front.units(run, a, b) || [],
      s = (r, u) => (u ? Front.strength(run, u) : 50) + (r === att ? FRONT.initiative : 0);
    return R() < clamp(0.5 + (s(a, U[0]) - s(b, U[1])) / 100, 0.2, 0.8) ? a : b;
  },
  /** w beat l on this week's border: Strength +WAR.win for w's unit, −WAR.lose (× soak) for l's. Returns the line ('' if no border). */
  result(run, w, l) {
    run.lastLoser = l;
    const U = Front.units(run, w, l);
    if (!U) return '';
    const s0 = War.str(run, U[1]);
    War.hit(run, U[0], true);
    War.hit(run, U[1], false);
    return `${WAR.units[U[1]].name} Strength ${s0} → ${War.str(run, U[1])}`;
  },
  /**
   * Preview of "w beats l" (nothing changes): { tile, name, unit (l's), str (now), after (after the win), seize, place, meter,
   * cost } — `seize` / `place` stay false / null: no place changes hands in a street battle (spec §4.34).
   */
  stakes(run, w, l) {
    const U = Front.units(run, w, l),
      c = Fight.clashSite(run);
    if (!U || !War.alive(run, U[1])) return { tile: null, name: '', unit: null, str: 0, after: 0, seize: false, place: null, meter: 0, cost: 0 };
    const s = War.str(run, U[1]);
    return {
      tile: c && [c.ua, c.ub].includes(U[1]) ? c.tile : null,
      name: c ? c.name : '',
      unit: U[1],
      str: s,
      after: clamp(Math.round(s - WAR.lose * (WAR.units[U[1]].soak || 1)), 0, 100),
      seize: false,
      place: null,
      meter: s,
      cost: WAR.start
    };
  },
  /**
   * This week's aggressor (FRONT.aggro + revenge for last week's loser) and its target (FRONT.prey, × FRONT.push where it is
   * winning). Regions with no standing unit are out of it. null when fewer than two majors stand.
   */
  pick(run) {
    const live = MAJORS.filter(r => Front.standing(run, r)),
      w = live.map(r => FRONT.aggro[r] + (run.lastLoser === r ? FRONT.revenge : 0)),
      sum = w.reduce((a, b) => a + b, 0);
    if (live.length < 2) return null;
    let x = R() * sum,
      i = 0;
    while (i < live.length - 1 && (x -= w[i]) >= 0) i++;
    const att = live[i],
      os = live.filter(r => r !== att),
      p = o => FRONT.prey[att][o] * (Front.meter(run, att, o) > 0 ? FRONT.push : 1),
      p1 = p(os[0]),
      y = R() * (p1 + (os[1] ? p(os[1]) : 0));
    return { att, def: !os[1] || y < p1 ? os[0] : os[1] };
  }
};
