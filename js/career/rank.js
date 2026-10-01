// The three rankings as plain data (DOM-free, no randoms: ties are broken by player id), each from a biased publisher
// (numbers are true, what counts is biased — lore.md §7): the Academy Register (true OVR, hidden unless you know the
// player), the Gazette Top 20 (fame; Wei-sanctioned matches only, so Wei players sit higher) and the Street board
// (street points). Display only: nothing here affects a match. State lives in run.met / run.street.

const Rank = {
  /** Every pool player of every faction, the Academy squad and you, once each: [{ p, region }] (region null = Academy). */
  players(run) {
    const seen = new Map(),
      add = (p, region) => p && !seen.has(p.id) && seen.set(p.id, { p, region });
    for (const r of Object.keys(POOL)) for (const p of Pool.players(run, r)) add(p, r);
    if (run.pickup) for (const p of squadOf(run.pickup)) add(p, null);
    add(Run.you(run), run.team != null && FACTIONS[run.team] ? FACTIONS[run.team].region : null);
    return [...seen.values()];
  },
  /** Do you know this player's rating: you, your squad, your faction, a scouted faction, or someone you faced on court. */
  known(run, e) {
    const you = Run.you(run),
      mine = City.myRegion(run);
    if (e.p === you || squadOf(Run.myTeam(run)).includes(e.p) || run.met[e.p.id]) return true;
    if (e.region && e.region === mine) return true;
    return !!e.region && FACTIONS.some((f, ti) => f.region === e.region && City.scouted(run, ti));
  },
  row: (e, extra) => ({ id: e.p.id, name: e.p.name, region: e.region, role: e.p.role, ...extra }),
  /** Order: value descending, then id. */
  sort: (rows, key) => rows.sort((a, b) => b[key] - a[key] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  /** Academy Register: everyone by true OVR; the number shows only for players you know (`ovr` null otherwise). */
  register(run) {
    const rows = Rank.players(run).map(e => Rank.row(e, { v: ovr(e.p), ovr: Rank.known(run, e) ? ovr(e.p) : null }));
    return Rank.sort(rows, 'v').map(({ v, ...r }) => r); // (the true OVR orders the list; it is not exposed)
  },
  /** Fame of one player: you = fans / 100; others star / OP / awakened element / team wins, × RANK.weiFame for Wei. */
  fame(run, e) {
    if (e.p === Run.you(run)) return run.fans / 100;
    const F = RANK.fame,
      w = e.p.team && e.p.team.hist ? e.p.team.hist.w : 0,
      v = (e.p.star ? F.star : 0) + (e.p.op ? F.op : 0) + (e.p.elOn ? F.el : 0) + w * F.win;
    return e.region === 'wei' ? v * RANK.weiFame : v;
  },
  /** Gazette Top 20 by fame (you only if you make the cut). */
  gazette(run) {
    const rows = Rank.players(run).map(e => Rank.row(e, { fame: Rank.fame(run, e) }));
    return Rank.sort(rows, 'fame').slice(0, RANK.top);
  },
  /** Street board: everyone with street points, most first. */
  street(run) {
    const rows = Rank.players(run)
      .map(e => Rank.row(e, { pts: run.street[e.p.id] || 0 }))
      .filter(r => r.pts > 0);
    return Rank.sort(rows, 'pts');
  },
  /** A player's 1-based place on each list (gazette / street null when not on it). */
  of(run, id) {
    const at = list => {
      const i = list.findIndex(r => r.id === id);
      return i < 0 ? null : i + 1;
    };
    return { register: at(Rank.register(run)), gazette: at(Rank.gazette(run)), street: at(Rank.street(run)) };
  },
  /** Street points for a player. */
  points(run, id, n) {
    run.street[id] = (run.street[id] || 0) + n;
  },
  /** You played a match: everyone you faced on court is now known to you. */
  meet(run, m) {
    for (const p of squadOf(m.t[1])) if (m.played.has(p.id)) run.met[p.id] = true;
  },
  /** A street battle was settled: faction w's best players (by OVR, not you) share the win. */
  settle(run, w) {
    const you = Run.you(run),
      best = Pool.players(run, w)
        .filter(p => p !== you)
        .sort((a, b) => ovr(b) - ovr(a) || (a.id < b.id ? -1 : 1))
        .slice(0, RANK.street.share);
    for (const p of best) Rank.points(run, p.id, RANK.street.faction);
  }
};
