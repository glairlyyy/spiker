// Monthly evaluations (weeks in CALENDAR marked 'eval'): who evaluates you and which squads play. DOM-free.
// A free agent in the Academy squad is evaluated by Central Academy against a squad drawn from a random major's pool;
// a member of a major plays that faction's own evaluation between squads drawn from its pool (you may not be drawn);
// a minor's member, or a player alone, has none. The match flow lives in Cup.fixture(run, 'eval').

/** [player, home team, cap flag, slot] of every player currently lent to a temporary squad. */
let EVAL_LENT = [];
const Eval = {
  /** 'academy' | 'faction' | null (no evaluation for you). */
  kind(run) {
    if (Season.rematch(run)) return 'rematch'; // year 2, week 14: the rival's club (spec §4.28)
    if (World.isFree(run)) return run.academy !== false ? 'academy' : null;
    const f = FACTIONS[run.team];
    return f && MAJORS.includes(f.region) ? 'faction' : null;
  },
  /** Draw this week's evaluation into run.eval ({ week, kind, region, mine, opp }: player id arrays); once per week. */
  setup(run) {
    const kind = Eval.kind(run);
    if (Season.cal(run, run.week) !== 'eval' || !kind) return null;
    if (run.eval && run.eval.week === run.week) return run.eval;
    const ids = sq => (sq ? sq.map(p => p.id) : null);
    let region, mine, opp;
    if (kind === 'rematch') return (run.eval = { week: run.week, ...Eval.rematch(run) });
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
  /**
   * The rematch's squads (spec §4.28): the rival's club with her starting, against your club (or the Academy squad: mine null)
   * with you starting; a squad short of players (you play for her club) is filled from your region's pool. Ids in court order.
   */
  rematch(run) {
    const you = Run.you(run),
      riv = Stars.get(run, 'rival'),
      region = (FACTIONS[riv.team.i] && FACTIONS[riv.team.i].region) || 'wei',
      opp = Eval.order([riv, ...squadOf(riv.team).filter(p => p !== you && p !== riv && !People.out(run, p))], riv);
    if (World.isFree(run)) return { kind: 'rematch', region, mine: null, opp: opp.map(p => p.id) };
    const mr = (FACTIONS[run.team] && FACTIONS[run.team].region) || region,
      taken = new Set(opp),
      club = squadOf(Run.myTeam(run)).filter(p => p !== you && !taken.has(p) && !People.out(run, p)),
      fill = Pool.players(run, mr).filter(p => p !== you && !taken.has(p) && !club.includes(p) && !People.out(run, p)),
      mine = Eval.order([you, ...club, ...fill.sort((a, b) => ovr(b) - ovr(a)).slice(0, Math.max(0, SQUAD - 1 - club.length))], you);
    return { kind: 'rematch', region, mineRegion: mr, mine: mine.map(p => p.id), opp: opp.map(p => p.id) };
  },
  /** Players → a squad in court order [S, MB, WS, WS] + bench (SQUAD in all): the best of each role by OVR, `must` in their role's slot. */
  order(ps, must) {
    const left = [...ps],
      take = role => {
        const c =
          left.filter(p => p.role === role).sort((a, b) => (b === must) - (a === must) || ovr(b) - ovr(a))[0] ||
          left.sort((a, b) => ovr(b) - ovr(a))[0];
        if (c) left.splice(left.indexOf(c), 1);
        return c;
      },
      court = ['S', 'MB', 'WS', 'WS'].map(take).filter(Boolean);
    return court.concat(left.sort((a, b) => (b === must) - (a === must) || ovr(b) - ovr(a)).slice(0, Math.max(0, SQUAD - court.length)));
  },
  /** A temporary squad from player ids (short: its 3-letter tag, 'EVL' only for an evaluation; first 4 = court order [S, MB, WS, WS], the rest the bench). Not a real team: never call finalizeTeam on it. */
  squad(run, ids, name, color, region = run.eval ? run.eval.region : 'wei', short = 'EVL') {
    const all = Pool.players(run, region).concat([Run.you(run)], run.pickup ? run.pickup.P : []),
      got = ids.map(id => all.find(p => p.id === id)).filter(Boolean),
      P = got.slice(0, 4),
      T = {
        i: -2,
        name,
        short,
        color,
        sk: 'balanced',
        S: STYLES.balanced,
        hist: { w: 0, l: 0, sw: 0, sl: 0, res: [] },
        nStars: 0,
        arch: 'Evaluation squad',
        coachIQ: 0.7,
        P,
        bench: got.slice(4)
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
    // the bench: only the team link (its cap flag and slot stay as they are)
    for (const p of T.bench || []) {
      if (!EVAL_LENT.some(x => x[0] === p)) EVAL_LENT.push([p, p.team, p.cap, p.slot]);
      p.team = T;
    }
  },
  /** Put every lent player back (safe to call twice). */
  restore() {
    for (const [p, team, cap, slot] of EVAL_LENT) [p.team, p.cap, p.slot] = [team, cap, slot];
    EVAL_LENT = [];
  },
  /** Not selected: watch from the bench (wit XP worth EVAL.benchDays day-sessions). Returns the diary line. */
  bench(run) {
    const region = run.eval ? run.eval.region : 'wei';
    return `Not selected for the ${REGIONS[region].name} evaluation. Watched from the bench: ${Eval.benchXp(run)}.`;
  },
  /** The bench reward itself: wit XP worth EVAL.benchDays day-sessions. Returns its label. */
  benchXp: run => Training.addXp(run, 'wit', Training.xpFor('wit', TRAININGS.wit.main[1], DAY_GAIN * EVAL.benchDays))
};
