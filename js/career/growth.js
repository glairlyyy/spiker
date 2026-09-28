// League growth between weeks: every non-player athlete grinds, and some break through.
// Your teammates grow the same way, but training beside you adds gains and raises their breakthrough odds.

const Growth = {
  /** One week of growth for everyone except you, then re-finalize every team. */
  week(run) {
    const you = Run.you(run);
    Growth.checkYou(run, you);
    for (const t of run.teams) {
      for (const p of t.P) {
        if (p === you) continue;
        const mate = t.i === run.team,
          bf = 1 + (mate ? you.bond[p.id] || 0 : 0) / GROWTH.bondDiv,
          pot = (p.pot || 1) * (run.mode && run.mode.hard ? 1.15 : 1); // Hard league: everyone else grows faster
        Growth.spread(p, rnd(GROWTH.weekly[0], GROWTH.weekly[1]) * pot);
        if (!p.star && R() < GROWTH.star * pot * bf) Growth.awaken(run, p, mate, false);
        else if (p.star && !p.op && R() < GROWTH.op * pot * bf) Growth.awaken(run, p, mate, true);
      }
      finalizeTeam(t);
    }
  },
  /** Your own star / OP status: earned by hitting the overall (and for OP, key stat + wit) criteria. */
  checkYou(run, you) {
    const o = ovr(you),
      C = CAREER;
    ElTrial.reveal(run, you);
    if (!you.star && o >= C.star.ovr) {
      you.star = true;
      you.bonus = Math.max(you.bonus, 18);
      Run.log(run, `You broke through — ${you.name} is now a ★ star!`);
    }
    if (you.star && !you.op && o >= C.op.ovr && you[KEYSTAT[you.role]] >= C.op.key && you.wit >= C.op.wit) {
      you.op = true;
      you.bonus = Math.max(you.bonus, 110);
      Run.log(run, `Awakening! ${you.name} is now an OP player — red star!`);
    }
  },
  /** Add `pts` stat points, key stat weighted double; fractions round up by chance. */
  spread(p, pts) {
    const key = KEYSTAT[p.role];
    for (const k of STATK) {
      const v = (pts * (k === key ? 0.4 : 0.2)) / (p[k] >= 90 ? 2 : 1),
        n = Math.floor(v) + (R() < v % 1 ? 1 : 0);
      p[k] = Math.min(99, p[k] + n);
    }
  },
  /** Breakthrough: star (key stat +8, others +3), or a star turning OP (+6 everywhere, wit up). */
  awaken(run, p, mate, op) {
    const key = KEYSTAT[p.role];
    for (const k of STATK) p[k] = Math.min(99, p[k] + (op ? 6 : k === key ? 8 : 3));
    p.wit = +Math.min(2, p.wit + (op ? 0.25 : 0.1)).toFixed(2);
    if (op) {
      p.op = true;
      p.bonus = Math.max(p.bonus, 110);
    } else {
      p.star = true;
      p.bonus = Math.max(p.bonus, 18);
    }
    const what = op ? 'awakens as an OP player — red star!' : 'breaks through as a ★ star!';
    Run.log(run, mate ? `Your teammate ${p.name} ${what}` : `League news: ${p.name} (${p.team.name}) ${what}`);
    if (!mate) Run.news(run, `${p.name} (${p.team.name}) ${what}`);
  },
  /** A teammate trained with you: they take a share of your gains. */
  shared(run, id, pv) {
    const m = Run.myTeam(run).P.find(p => p.id === id);
    if (!m) return;
    const [mk, mv] = pv.main,
      [sk, sv] = pv.side;
    if (mk === 'wit') m.wit = +Math.min(2, m.wit + mv * GROWTH.share).toFixed(2);
    else m[mk] = Math.min(99, m[mk] + Math.round(mv * GROWTH.share));
    m[sk] = Math.min(99, m[sk] + Math.round(sv * GROWTH.share * 0.5));
  }
};
