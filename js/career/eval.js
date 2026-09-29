// Monthly evaluations (weeks in CALENDAR marked 'eval'): who evaluates you and which squads play. DOM-free.
// A free agent in the Academy squad is evaluated by Central Academy against a squad drawn from a random major's pool;
// a member of a major plays that faction's own evaluation between squads drawn from its pool (you may not be drawn);
// a minor's member, or a player alone, has none. The match flow lives in Cup.fixture(run, 'eval').

/** [player, home team, cap flag, slot] of every player currently lent to a temporary squad. */
let EVAL_LENT = [];
const Eval = {
  /** 'academy' | 'faction' | null (no evaluation for you). */
  kind(run) {
    if (World.isFree(run)) return run.academy !== false ? 'academy' : null;
    const f = FACTIONS[run.team];
    return f && MAJORS.includes(f.region) ? 'faction' : null;
  },
  /** Draw this week's evaluation into run.eval ({ week, kind, region, mine, opp }: player id arrays); once per week. */
  setup(run) {
    const kind = Eval.kind(run);
    if (CALENDAR[run.week] !== 'eval' || !kind) return null;
    if (run.eval && run.eval.week === run.week) return run.eval;
    const ids = sq => (sq ? sq.map(p => p.id) : null);
    let region, mine, opp;
    if (kind === 'academy') {
      region = pick(MAJORS);
      mine = null; // your side is the Academy squad
      opp = ids(Pool.draw(run, region, 1)[0]);
    } else {
      region = FACTIONS[run.team].region;
      const squads = Pool.draw(run, region),
        you = Run.you(run),
        i = squads.findIndex(s => s.includes(you));
      mine = i < 0 ? null : ids(squads[i]);
      opp = i < 0 || squads.length < 2 ? null : ids(squads[i + 1] || squads[i - 1]);
    }
    return (run.eval = { week: run.week, kind, region, mine, opp });
  },
  /** A temporary squad from player ids (in [S, MB, WS, WS] order). Not a real team: never call finalizeTeam on it. */
  squad(run, ids, name, color) {
    const all = Pool.players(run, run.eval ? run.eval.region : 'wei').concat([Run.you(run)]),
      P = ids.map(id => all.find(p => p.id === id)).filter(Boolean),
      T = {
        i: -2,
        name,
        short: 'EVL',
        color,
        sk: 'balanced',
        S: STYLES.balanced,
        hist: { w: 0, l: 0, sw: 0, sl: 0, res: [] },
        nStars: 0,
        arch: 'Evaluation squad',
        coachIQ: 0.7,
        P
      };
    [T.s, T.mb] = P;
    T.ws = [P[2], P[3]];
    T.cap = P.reduce((a, p) => (p.lead > a.lead ? p : a), P[0]);
    T.ovr = teamOvr(T);
    return T;
  },
  /** Point the players' team (and captain flag, court slot) at the temporary squad T; restore() undoes it. */
  lend(run, T) {
    T.P.forEach((p, i) => {
      if (!EVAL_LENT.some(x => x[0] === p)) EVAL_LENT.push([p, p.team, p.cap, p.slot]);
      p.team = T;
      p.cap = p === T.cap;
      p.slot = ['S', 'MB', 'W0', 'W1'][i];
    });
  },
  /** Put every lent player back (safe to call twice). */
  restore() {
    for (const [p, team, cap, slot] of EVAL_LENT) [p.team, p.cap, p.slot] = [team, cap, slot];
    EVAL_LENT = [];
  },
  /** Not selected: watch from the bench (wit XP worth EVAL.benchDays day-sessions). Returns the diary line. */
  bench(run) {
    const region = run.eval ? run.eval.region : 'wei',
      label = Training.addXp(run, 'wit', Training.xpFor('wit', TRAININGS.wit.main[1], DAY_GAIN * EVAL.benchDays));
    return `Not selected for the ${REGIONS[region].name} evaluation. Watched from the bench: ${label}.`;
  }
};
