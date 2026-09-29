// Faction pools: each faction is a roster of players = its league-team players + generated reserves
// (reserves are stored in run.reserve[region]; not used in play yet). DOM-free.

const Pool = {
  /** Generate the reserves of every faction, so each pool reaches POOL[region]. Returns { region: reserveTeam }. */
  build(teams, used) {
    const out = {};
    for (const r of Object.keys(POOL)) {
      const have = teams.filter(t => FACTIONS[t.i] && FACTIONS[t.i].region === r).reduce((n, t) => n + t.P.length, 0),
        n = Math.max(0, POOL[r] - have),
        t = {
          i: -1,
          name: `${REGIONS[r].name} reserves`,
          short: 'RES',
          color: REGIONS[r].color,
          sk: 'balanced',
          S: STYLES.balanced,
          hist: { w: 0, l: 0, sw: 0, sl: 0, res: [] },
          nStars: 0,
          arch: 'Reserves',
          region: r,
          P: []
        };
      for (let k = 0; k < n; k++) {
        const p = mkPlayer(['S', 'MB', 'WS', 'WS'][k % 4], ['S', 'MB', 'W0', 'W1'][k % 4], 0, t, used);
        p.pot = +rnd(GROWTH.pot[0], GROWTH.pot[1]).toFixed(2);
        t.P.push(p);
      }
      if (t.P.length) finalizeTeam(t);
      out[r] = t;
    }
    return out;
  },
  /** Every player of a faction: its league-team players, then its reserves. */
  players(run, r) {
    const res = run.reserve && run.reserve[r];
    return run.teams
      .filter(t => FACTIONS[t.i] && FACTIONS[t.i].region === r)
      .flatMap(t => t.P)
      .concat(res ? res.P : []);
  },
  size: (run, r) => Pool.players(run, r).length,
  /**
   * Draw n squads ([S, MB, WS, WS], new arrays; nothing is mutated) from faction r's pool, favouring better players
   * (see DRAW). You are a candidate only while signed with r; standing ≥ DRAW.sure puts you in squad 1.
   */
  draw(run, r, n = Math.floor(Pool.size(run, r) / 4)) {
    const you = Run.you(run),
      mine = run.team != null && FACTIONS[run.team] && FACTIONS[run.team].region === r,
      rep = City.rep(run, r),
      weight = p => {
        const w = Math.max(DRAW.minW, (ovr(p) - DRAW.floor) / DRAW.span);
        return p === you ? w * (1 + Math.max(0, rep) / DRAW.repPer) : w;
      },
      left = Pool.players(run, r).filter(p => p !== you || mine),
      slots = ['S', 'MB', 'WS', 'WS'],
      take = p => left.splice(left.indexOf(p), 1),
      squads = [];
    for (let i = 0; i < n && left.length >= 4; i++) {
      const sq = [null, null, null, null];
      if (i === 0 && mine && rep >= DRAW.sure) {
        sq[you.role === 'S' ? 0 : you.role === 'MB' ? 1 : 2] = you;
        take(you);
      }
      for (let k = 0; k < 4; k++) {
        if (sq[k]) continue;
        const of = left.filter(p => p.role === slots[k]);
        const p = of.length ? wpick(of, weight) : left.reduce((a, b) => (weight(b) > weight(a) ? b : a));
        sq[k] = p;
        take(p);
      }
      squads.push(sq);
    }
    return squads;
  }
};
