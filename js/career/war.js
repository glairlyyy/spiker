// The faction war (spec §4.34): war units (WAR.units) with Strength 0–100, worn down by street battles on their border and
// rallying when left alone; their stage (WAR_STAGES) debuffs every squad of the unit in a match. Territory never moves
// tile by tile: each hex tile starts in one unit (Hex.grid t.unit) and only a destroyed unit's land changes hands (to its
// destroyer: War.holder). Run state: run.war = { str: { unit: n }, fallen: { unit: { by, week } }, last: { unit: week of
// its last street battle }, ot: { unit: week of its last overthrow match }, walk: the rival's walk-out { id, to, week } }. DOM-free, no randoms.

const War = {
  ids: () => Object.keys(WAR.units),
  /** The unit club ti plays for (null for the minors). */
  ofClub: ti => War.ids().find(u => WAR.units[u].clubs.includes(ti)) || null,
  /** Region r's units (start order). */
  ofRegion: r => War.ids().filter(u => WAR.units[u].region === r),
  fresh: () => ({ str: Object.fromEntries(War.ids().map(u => [u, WAR.start])), fallen: {}, last: {}, ot: {} }),
  state(run) {
    const W = run.war || (run.war = War.fresh());
    for (const k of ['str', 'fallen', 'last', 'ot']) if (!W[k] || typeof W[k] !== 'object') W[k] = k === 'str' ? War.fresh().str : {};
    return W;
  },
  str: (run, u) => {
    const s = War.state(run).str[u];
    return Number.isFinite(s) ? s : WAR.start;
  },
  fallen: (run, u) => !!War.state(run).fallen[u],
  alive: (run, u) => !!WAR.units[u] && !War.fallen(run, u),
  /** Stage index (WAR_STAGES: 0 Steady … 3 Broken) for a Strength. */
  level: s => WAR_STAGES.reduce((k, S, i) => (s < S.below ? i : k), 0),
  /** A unit's own stage (what the cards and the border show). */
  stage: (run, u) => (War.alive(run, u) ? War.level(War.str(run, u)) : 0),
  /**
   * The stage a unit's squads play with (spec §4.34): its own, `late` stages late (Shu); an inner ring also takes its outer
   * ring's stage one step lighter while that stands (Iron Shaken → Gold Strained).
   */
  weak(run, u) {
    if (!War.alive(run, u)) return 0;
    const D = WAR.units[u];
    let k = War.stage(run, u) - (D.late || 0);
    if (D.inner && War.alive(run, D.inner)) k = Math.max(k, War.weak(run, D.inner) - 1);
    return Math.max(0, k);
  },
  /**
   * The war stage a squad plays with (spec §4.34): its club's unit, a street crew's unit (T.wu), a region's drawn squad (T.wr:
   * its least-hit standing unit); 0 for the Academy, the minors and hired crews.
   */
  weakOf(run, T) {
    if (!T) return 0;
    if (T.wu) return War.weak(run, T.wu);
    const u = War.ofClub(T.i);
    if (u) return War.weak(run, u);
    const us = T.wr ? War.ofRegion(T.wr).filter(x => War.alive(run, x)) : [];
    return us.length ? Math.min(...us.map(x => War.weak(run, x))) : 0;
  },
  /** A career fixture's setup: both sides' war stages into the match (weakSet: morale start, HP heal, card slots). */
  match(run, m) {
    weakSet(m, [War.weakOf(run, m.t[0]), War.weakOf(run, m.t[1])]);
  },
  /** The unit holding what u started with: u itself, or (destroyed) its destroyer's holder. */
  holder(run, u) {
    const F = War.state(run).fallen;
    for (let i = 0; i < 8 && F[u]; i++) u = F[u].by;
    return u;
  },
  /** The unit holding tile id now (null: the minors and the Academy). */
  unitAt(run, id) {
    const t = Hex.tile(id);
    return t && t.unit ? War.holder(run, t.unit) : null;
  },
  /** The region holding tile id now (its holder unit's, else its own). */
  regionAt(run, id) {
    const u = War.unitAt(run, id);
    return u ? WAR.units[u].region : Hex.tile(id).region;
  },
  /**
   * The border edges between two units' land: [{ tile (b's), from (a's) }], both tiles' centres on land, a hash order
   * (stable). Different regions only: Gold and Iron are one faction.
   */
  edges(run, a, b) {
    const out = [];
    if (!War.alive(run, a) || !War.alive(run, b) || WAR.units[a].region === WAR.units[b].region) return out;
    for (const t of Hex.grid().tiles) {
      if (War.unitAt(run, t.id) !== b || !City.onLand(t.at)) continue;
      for (const n of Hex.near(t.id)) if (War.unitAt(run, n.id) === a && City.onLand(n.at)) out.push({ tile: t.id, from: n.id });
    }
    return out.sort((x, y) => hstr(`${x.tile}|${x.from}`) - hstr(`${y.tile}|${y.from}`));
  },
  /** The unit pairs [ua (region att), ud (region def)] whose land touches. */
  pairs(run, att, def) {
    const out = [];
    for (const ua of War.ofRegion(att)) for (const ud of War.ofRegion(def)) if (War.edges(run, ua, ud).length) out.push([ua, ud]);
    return out;
  },
  /** Region r's Strength for its economy: the mean of its standing units (100 when none stands). */
  regionStr(run, r) {
    const us = War.ofRegion(r).filter(u => War.alive(run, u));
    return us.length ? us.reduce((s, u) => s + War.str(run, u), 0) / us.length : WAR.start;
  },
  /**
   * A street-battle result for unit u: won → +WAR.win × k, lost → −WAR.lose × k × its soak (Shu × 0.5); Strength stays in
   * 0–100 and the unit counts as fought this week. k = 2 for your Raid (T-318). A new stage makes the news. Returns the change.
   */
  hit(run, u, win, k = 1) {
    if (!War.alive(run, u)) return 0;
    const W = War.state(run),
      s0 = War.str(run, u),
      d = win ? WAR.win * k : -WAR.lose * k * (WAR.units[u].soak || 1);
    W.str[u] = clamp(Math.round(s0 + d), 0, 100);
    W.last[u] = run.week;
    const a = War.level(s0),
      b = War.level(W.str[u]);
    if (b > a) Run.news(run, `${WAR.units[u].name} is ${WAR_STAGES[b].name.toLowerCase()} — Strength ${W.str[u]}.`);
    return W.str[u] - s0;
  },
  /** Week end: a standing unit nobody fought for WAR.idle weeks rallies +WAR.regen. */
  week(run) {
    const W = War.state(run);
    for (const u of War.ids())
      if (War.alive(run, u) && run.week - (W.last[u] || 0) >= WAR.idle) W.str[u] = Math.min(100, War.str(run, u) + WAR.regen);
    War.ai(run);
  },
  // ---- the overthrow (spec §4.34, T-315) ----
  /** The standing units of another region across u's border: who may challenge it. */
  foes: (run, u) => War.ids().filter(o => War.edges(run, o, u).length),
  /** u's ace squad: the best-rated of its clubs (Shu: Peak or Valley). */
  ace: (run, u) =>
    WAR.units[u].clubs.map(ti => run.teams[ti]).reduce((a, t) => (t.ovr > a.ovr ? t : a)),
  /** Weeks until u may be challenged again (0 = now): WAR.cool after its last overthrow match. */
  cool(run, u) {
    const t = War.state(run).ot[u];
    return Number.isFinite(t) ? Math.max(0, WAR.cool - (run.week - t)) : 0;
  },
  /** Is club ti's unit destroyed (the club has stopped)? */
  down: (run, ti) => {
    const u = War.ofClub(ti);
    return !!u && War.fallen(run, u);
  },
  /** Can unit `by` challenge u now? { ok, why } — u standing and Broken, `by` across its border, no cooldown. */
  can(run, u, by) {
    const n = War.cool(run, u),
      why = !War.alive(run, u)
        ? 'already destroyed'
        : War.stage(run, u) < WAR_STAGES.length - 1
          ? `not Broken — Strength ${War.str(run, u)} of under ${WAR_STAGES[WAR_STAGES.length - 1].below}`
          : n
            ? `rallied — again in ${n} week${n > 1 ? 's' : ''}`
            : !by || !War.foes(run, u).includes(by)
              ? 'no border with it'
              : '';
    return { ok: !why, why };
  },
  /**
   * Who you would fight for against u: your club's unit (signed: { by, kind: 'club' }), or alone the strongest unit across
   * its border, you leading a hired street crew ({ by, kind: 'crew', cost }). null when you have no side (signed elsewhere).
   */
  side(run, u) {
    if (!World.isFree(run)) {
      const by = War.ofClub(run.team);
      return by && War.foes(run, u).includes(by) ? { by, kind: 'club', cost: 0 } : null;
    }
    const F = War.foes(run, u);
    if (!F.length) return null;
    return { by: F.reduce((a, b) => (War.str(run, b) > War.str(run, a) ? b : a)), kind: 'crew', cost: CHALLENGE.hire.cost };
  },
  /** The trip to u's ace HQ + the day. */
  cost: (run, u) => City.scoutCost(run, War.ace(run, u).i),
  /**
   * Challenge u's ace squad at its HQ (spec §4.34): your club, or a street crew you lead for a unit across its border. A real
   * match like a challenge; nothing is spent until it finishes. null when you can't now.
   */
  overthrow(run, u) {
    const S = War.side(run, u);
    if (!S || !War.can(run, u, S.by).ok || run.event || Fight.ban(run) || City.noTime(run, War.cost(run, u)) || run.money < S.cost)
      return null;
    const opp = War.ace(run, u),
      mine = S.kind === 'club' ? Run.myTeam(run) : Fight.hired(run);
    if (S.kind === 'crew') {
      Eval.lend(run, mine);
      mine.wu = S.by;
    }
    Cup.prepare(run, opp, 'challenge', mine);
    Run.lineup(run, mine, City.myRegion(run), false, true);
    Run.lineup(run, opp, null);
    const rel = Rel.matchFlags(run, mine, opp);
    return {
      a: mine,
      b: opp,
      round: `Overthrow: ${mine.name} vs ${opp.name} · ${WAR.units[u].name} at stake`,
      back: 'Continue',
      rel,
      setup: m => {
        m.rel = rel;
        War.match(run, m);
      },
      onFinish: m => {
        Eval.restore();
        return War.overthrowResult(run, m, u, S);
      },
      onLeave: () => Eval.restore()
    };
  },
  /** After your overthrow match: the trip + a day, the crew's pay, stamina, XP; a win destroys u, a loss rallies it. Returns the log line. */
  overthrowResult(run, m, u, S) {
    const opp = War.ace(run, u),
      win = m.winner === 0,
      you = Run.you(run),
      s = m.stat[you.id] || blank(),
      [grade, , gmul] = Cup.grade(s, win),
      sc = m.setScores[0],
      margin = win ? 0 : Math.max(0, sc[1] - sc[0]),
      risk = Fight.injuryRisk(run, opp.ovr, margin),
      trip = (Cup.record(run, m, 'overthrow'), City.go(run, CITY.hq[opp.i], { k: 'challenge', label: 'Overthrow', at: opp.name })),
      out = [Growth.matchXp(run, m), Skills.tryLearn(run, m)];
    if (S.cost) {
      const pay = Math.min(run.money, S.cost);
      run.money -= pay;
      out.push(`−$${pay} for the crew`);
    }
    out.push(Run.bump(run, 'sta', -CLASH.sta));
    if (win) out.push(Run.bump(run, 'fans', Math.round(CLASH.fans * 2 * gmul)));
    else Fight.lose(run, opp.name, margin, null, out);
    out.push(Fight.injure(run, risk));
    run.lastFight = Run.dayNo(run);
    War.state(run).ot[u] = run.week;
    const end = win ? War.destroy(run, u, S.by) : War.rally(run, u);
    const line = `${trip}Overthrow at ${opp.name} for ${WAR.units[S.by].name} — ${win ? 'won' : 'lost'} ${sc[0]}-${sc[1]}, grade ${grade} · ${out
      .filter(Boolean)
      .join(', ')}. ${end}`;
    Run.log(run, line);
    Run.save(run);
    return line;
  },
  /** An overthrow lost by the attacker: u rallies +WAR.rally. Returns the line. */
  rally(run, u) {
    const W = War.state(run);
    W.str[u] = Math.min(100, War.str(run, u) + WAR.rally);
    W.ot[u] = run.week;
    const line = WAR_LINES.rallied.replace('{unit}', WAR.units[u].name);
    Run.news(run, line);
    return line;
  },
  /**
   * u is destroyed by unit `by` (spec §4.34): its land and places go to by's holder (War.holder → run.own), its clubs stop —
   * you are a free agent again if you played for one —, the best players go to the winner's reserves, the rival walks out
   * (never to the winner's side nor yours: `run.war.walk`, her scene), and its Cup places go to the winner (Cup.places).
   * Returns the news line.
   */
  destroy(run, u, by) {
    const W = War.state(run),
      wr = WAR.units[War.holder(run, by)].region,
      you = Run.you(run),
      riv = Stars.get(run, 'rival');
    W.fallen[u] = { by, week: run.week };
    W.str[u] = 0;
    W.ot[u] = run.week;
    War.sync(run);
    for (const ti of WAR.units[u].clubs) {
      const T = run.teams[ti];
      if (run.team === ti) War.free(run, T);
      if (riv && squadOf(T).includes(riv)) War.walkout(run, riv, wr);
      const best = squadOf(T)
        .filter(p => p !== you && p !== riv)
        .sort((a, b) => ovr(b) - ovr(a) || hstr(String(a.id)) - hstr(String(b.id)));
      let moved = 0;
      for (const p of best) if (moved < WAR.scatter && War.into(run, p, wr)) moved++;
    }
    const line = WAR_LINES.fall[wr]
      .replace('{loser}', WAR.units[u].name)
      .replace('{winner}', WAR.units[by].name);
    Run.news(run, line);
    return line;
  },
  /** You leave a club that has stopped: back on the Academy squad's bench as a free agent (a story line in the diary). */
  free(run, T) {
    const you = Run.you(run),
      P = run.pickup,
      q = squadOf(P).find(p => p.role === you.role) || P.P[P.P.length - 1];
    World.swap(you, q);
    run.team = null;
    finalizeTeam(T);
    finalizeTeam(P);
    Run.log(run, WAR_LINES.freed, 'bad');
  },
  /** The rival walks out of a fallen club (spec §4.34): to another standing major — not the winner's, not yours — else St. Gloria. */
  walkout(run, p, wr) {
    const mine = run.team != null && FACTIONS[run.team] ? FACTIONS[run.team].region : null,
      home = FACTIONS[p.team.i] ? FACTIONS[p.team.i].region : null,
      to = MAJORS.filter(r => r !== wr && r !== mine && r !== home && Front.standing(run, r)).sort(
        (a, b) => War.regionStr(run, b) - War.regionStr(run, a)
      )[0];
    if (War.into(run, p, to || 'gloria')) War.state(run).walk = { id: p.id, to: to || 'gloria', week: run.week };
  },
  /**
   * Move p into region r's pool: a seat swap with its reserves (People.toReserve), else with the weakest same-role player
   * (never you, never a named one) of its best standing club. False when there is no seat.
   */
  into(run, p, r) {
    if (People.toReserve(run, p, r)) return true;
    const you = Run.you(run),
      T = run.teams
        .filter(t => FACTIONS[t.i] && FACTIONS[t.i].region === r && !War.down(run, t.i))
        .sort((a, b) => b.ovr - a.ovr)[0],
      q =
        T &&
        squadOf(T)
          .filter(x => x !== you && !x.named && x.role === p.role)
          .sort((a, b) => ovr(a) - ovr(b))[0];
    if (!q) return false;
    const t0 = p.team;
    World.swap(p, q);
    finalizeTeam(T);
    finalizeTeam(t0);
    return true;
  },
  /** AI overthrows (week end): a Broken unit under WAR.ai with no cooldown is challenged by its strongest foe — a simmed match. */
  ai(run) {
    for (const u of War.ids()) {
      if (!War.alive(run, u) || War.str(run, u) >= WAR.ai) continue;
      const F = War.foes(run, u);
      if (!F.length || War.cool(run, u)) continue;
      const by = F.reduce((a, b) => (War.str(run, b) > War.str(run, a) ? b : a)),
        A = War.ace(run, by),
        D = War.ace(run, u),
        m = simMatch(A, D, { weak: [War.weak(run, by), War.weak(run, u)] });
      War.state(run).ot[u] = run.week;
      Run.log(run, `Overthrow at ${D.name}: ${A.name} ${m.winner === 0 ? 'won' : 'lost'} ${m.setScores[0].join('-')}. ${
        m.winner === 0 ? War.destroy(run, u, by) : War.rally(run, u)
      }`, 'world');
    }
  },
  /** The tiles unit u holds now (a Set of ids). */
  land(run, u) {
    return new Set(
      Hex.grid()
        .tiles.filter(t => War.unitAt(run, t.id) === u)
        .map(t => t.id)
    );
  },
  /** u's border (spec §4.34): the outer edge of its land, one closed smoothed loop [[x, y]…] (cached until a unit falls). */
  outline(run, u) {
    const key = `${u}|${War.ids().map(x => War.holder(run, x)).join()}`,
      C = War.lineCache || (War.lineCache = new Map());
    if (!C.has(key)) {
      const L = Hex.outline(War.land(run, u))[0];
      C.set(key, L ? Hex.smooth(L, 2, true) : []);
    }
    return C.get(key);
  },
  /**
   * The stretch where units a and b meet: open polylines of the tile edges between their land (smoothed), longest first.
   */
  meet(run, a, b) {
    const A = War.land(run, a),
      key = p => `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`,
      segs = [];
    for (const id of A) {
      const t = Hex.tile(id),
        C = Hex.corners(Hex.centre(t.q, t.r));
      for (let i = 0; i < 6; i++) {
        const n = Hex.across(t, i);
        if (n && War.unitAt(run, n.id) === b) segs.push([C[i], C[(i + 1) % 6]]);
      }
    }
    // chain the segments into polylines (a's edges all run the same way round)
    const from = new Map(segs.map(s => [key(s[0]), s])),
      to = new Set(segs.map(s => key(s[1]))),
      used = new Set(),
      lines = [];
    const starts = segs.filter(s => !to.has(key(s[0]))).concat(segs);
    for (const s0 of starts) {
      if (used.has(s0)) continue;
      const L = [s0[0]];
      let s = s0;
      while (s && !used.has(s)) {
        used.add(s);
        L.push(s[1]);
        s = from.get(key(s[1]));
      }
      lines.push(Hex.smooth(L, 2, false));
    }
    const len = L => L.reduce((n, p, i) => (i ? n + Math.hypot(p[0] - L[i - 1][0], p[1] - L[i - 1][1]) : 0), 0);
    return lines.sort((x, y) => len(y) - len(x));
  },
  /** run.own = { placeId: holder region } for every place whose tile's holder is not the place's own region (Front.owner reads it). */
  sync(run) {
    const own = {};
    for (const t of Hex.grid().tiles)
      for (const id of t.spots) {
        const r = War.regionAt(run, t.id);
        if (!id.startsWith('venue:') && r !== SPOTS[id].region) own[id] = r;
      }
    run.own = own;
  }
};
