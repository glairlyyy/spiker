// Two seasons (spec §4.28): Story mode plays year 1 and year 2 (CAREER.weeks + the U21 Cup each); the year-1 Cup no longer
// ends the run — Season.rollover runs the off-season and starts year 2 at week 1. `run.week` is the week of the season;
// stored week stamps that count differences (cooldowns, memories) are rebased by −SEASON.shift so they keep counting.
// DOM-free; draws no randoms.

const Season = {
  /** The year being played (1 | 2). */
  year: run => run.year || 1,
  /** Is this the run's last season? Endless (no Story) and year 2 end at their Cup. */
  last: run => !(run.mode && run.mode.story) || Season.year(run) >= SEASON.years,
  /** The week counted from the run's start (week + earlier seasons): the seed of weekly hashes, so year 2 doesn't replay year 1. */
  wk: run => run.week + (Season.year(run) - 1) * SEASON.shift,
  /** What week w of this season is (CALENDAR; Story year 2 adds the rematch week as an evaluation week). */
  cal: (run, w) =>
    Season.year(run) > 1 && run.mode && run.mode.story && w === SEASON.rematch && Stars.get(run, 'rival') ? 'eval' : CALENDAR[w],
  /** Is this week the year-2 rematch? */
  rematch: run => Season.year(run) > 1 && !!(run.mode && run.mode.story) && run.week === SEASON.rematch && !!Stars.get(run, 'rival'),
  /** A display label: "W5" in year 1, "Y2 W5" after. */
  label: (y, w) => `${(y || 1) > 1 ? `Y${y} ` : ''}W${w}`,
  /** The label of a stored (rebased) week stamp `w`: stamps from an earlier year sit at or below 0 after the rollover. */
  at(run, w) {
    const abs = w + (Season.year(run) - 1) * SEASON.shift,
      y = Math.max(1, Math.floor((abs - 1) / SEASON.shift) + 1);
    return Season.label(Season.year(run) > 1 ? y : 1, abs - (y - 1) * SEASON.shift);
  },
  /** The year-1 Cup is over (Cup.close): the off-season, then year 2's week 1. */
  rollover(run) {
    const S = SEASON.shift;
    Season.offseason(run);
    // stamps that count weeks (or days) since: rebased so the gaps stay true
    for (const me of Object.values(run.people || {})) {
      if (Number.isFinite(me.bench)) me.bench -= S;
      if (me.gone && Number.isFinite(me.gone.week)) me.gone.week -= S;
    }
    for (const L of Object.values(run.mem || {})) for (const e of L) if (Number.isFinite(e.w)) e.w -= S;
    if (run.war) for (const T of [run.war.last, run.war.ot]) for (const k of Object.keys(T || {})) T[k] -= S;
    for (const k of Object.keys(run.scout || {})) run.scout[k] -= S;
    for (const r of Object.values(run.refused || {})) if (Number.isFinite(r.week)) r.week -= S;
    for (const l of Object.values(run.loans || {})) if (Number.isFinite(l.due)) l.due = Math.max(1, l.due - S);
    if (Number.isFinite(run.elNext)) run.elNext = Math.max(0, run.elNext - S);
    if (Number.isFinite(run.lastFight)) run.lastFight -= S * WEEK_DAYS;
    if (run.story && run.story.res) run.story.res.week -= S;
    // this week's things: gone with the season
    Object.assign(run, { sitout: null, duo: null, asks: [], eval: null, cup: null, clash: null, streak: null });
    run.year = Season.year(run) + 1;
    run.week = 1;
    Stars.week(run); // the named onto their year-2 curves
    run.trained = 0;
    run.days = WEEK_DAYS;
    run.dayLog = [];
    run.sta = run.staMax;
    Run.log(run, `Year ${run.year} begins. Week 1 again — the island looks the same; you don't.`);
    Run.nextWeek(run);
    Run.snap(run);
    Run.save(run);
  },
  /** Between the years (T-287): who leaves, transfers, promotions, a year of growth. */
  offseason(run) {
    const before = Math.round(Season.mean(run));
    // the first aces age out of the U21s: their club's best same-role reserve takes the seat
    for (const p of Stars.all(run).filter(q => q.named === 'ace')) {
      const t = p.team,
        own = (FACTIONS[t.i] && FACTIONS[t.i].region) || 'outlaws',
        rs = [own, ...Object.keys(run.reserve || {}).filter(r => r !== own)],
        r = rs.find(x => run.reserve[x] && run.reserve[x].P.some(q => q.role === p.role)) || own; // a same-role reserve, any pool
      if (!People.toReserve(run, p, r)) continue;
      People.remove(run, p, 'abroad');
      Run.news(run, `${p.name} ages out of the U21s and leaves ${t.name} — a seat opens.`);
    }
    // the market and the summer: the existing weekly rules, run in a row (the main stream, as any payday)
    for (let i = 0; i < OFFSEASON.transfers; i++) World.transfers(run);
    World.promote(run);
    const wk = run.week;
    for (let i = 0; i < OFFSEASON.summer; i++) Growth.week(run);
    run.week = wk;
    Run.news(run, `The off-season: the league's average rating moves from ${before} to ${Math.round(Season.mean(run))}.`);
    World.gazette(run);
  },
  /** The league's mean OVR (every club squad but you). */
  mean(run) {
    const you = Run.you(run),
      P = run.teams.flatMap(t => squadOf(t)).filter(p => p !== you);
    return P.reduce((a, p) => a + ovr(p), 0) / Math.max(1, P.length);
  }
};
