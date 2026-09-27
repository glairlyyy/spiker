// Career matches: warm-ups, the Skyline Cup (after week 24) and the Grand Cup (after week 28), match grades,
// pre-match focus, the captain's team talk, placement rewards and the end of a run.

const Cup = {
  /** Warm-up opponent: 'warmup' a random team (fixed for the week), 'warmup2' the strongest other team. */
  warmupOpponent(run) {
    const others = run.teams.filter((t, i) => i !== run.team);
    if (Run.weekType(run) === 'warmup2') return others.reduce((a, t) => (t.ovr > a.ovr ? t : a)).i;
    if (run.warmOpp == null || run.warmOpp.week !== run.week) run.warmOpp = { week: run.week, i: pick(others).i };
    return run.warmOpp.i;
  },
  /** A cup begins: stamina refills, the bracket is drawn (the Grand Cup is seeded by rating: 1v8, 4v5, 2v7, 3v6). */
  start(run, def) {
    run.sta = run.staMax;
    let ord = [...run.teams.keys()].sort(() => R() - 0.5);
    if (def.seeded) {
      const s = [...run.teams].sort((a, b) => b.ovr - a.ovr).map(t => t.i);
      ord = [s[0], s[7], s[3], s[4], s[1], s[6], s[2], s[5]];
    }
    run.cup = { id: def.id, sched: newBracket(ord), done: false };
    Run.log(run, `The ${def.name} begins${def.seeded ? ' (seeded by rating)' : ''}. Stamina refilled.`);
  },
  /** Your next Cup match; other matches of earlier slots in the round are simulated first. */
  next(run) {
    const S = run.cup.sched;
    for (;;) {
      const m = advanceBracket(S);
      if (!m) return null;
      if (m.a === run.team || m.b === run.team) return m;
      Cup.simulate(run, m);
    }
  },
  /** Play a bracket entry you are not in headlessly and record its winner and score. */
  simulate(run, x) {
    const m = simMatch(run.teams[x.a], run.teams[x.b]),
      sc = m.setScores[0];
    x.w = m.winner === 0 ? x.a : x.b;
    x.res = [sc[0], sc[1]];
  },
  /** Everything after you are knocked out or crowned: finish the bracket in the background. */
  finishBracket(run) {
    let m;
    while ((m = advanceBracket(run.cup.sched))) Cup.simulate(run, m);
  },
  /** Match-day form: your mood, +0.1 per 80+ bond for your side, Home crowd, the captain's talk; noise for the opponents. */
  prepare(run, opp, kind) {
    const you = Run.you(run),
      mine = Run.myTeam(run),
      bonds = Run.mates(run).filter(m => (you.bond[m.id] || 0) >= 80).length;
    const home = kind === 'cup' && Legacy.on(run, 'home') ? 0.3 : 0,
      talk = kind === 'cup' && you.cap ? run.talk : null;
    for (const p of mine.P) {
      let f = (p === you ? MOODS[run.mood].form : 0.1 * bonds) + home;
      if (talk === 'fire' && p !== you) f += 0.35;
      if (talk === 'calm') f = Math.max(f, 0.2);
      p.form = +Math.min(1, f).toFixed(2);
    }
    for (const p of opp.P) p.form = +(rnd(-0.2, 0.2) - (talk === 'calm' ? 0.15 : 0)).toFixed(2);
  },
  /** Fixture for the match screen. kind: 'warmup' | 'cup'. Your team is always on the left. */
  fixture(run, kind) {
    const mine = Run.myTeam(run),
      def = Run.cupDef(run),
      bm = kind === 'cup' ? Cup.next(run) : null,
      oi = kind === 'cup' ? (bm.a === run.team ? bm.b : bm.a) : Cup.warmupOpponent(run),
      opp = run.teams[oi],
      you = Run.you(run);
    Cup.prepare(run, opp, kind);
    return {
      a: mine,
      b: opp,
      round: kind === 'cup' ? `${def.name} ${bm.round}` : `Warm-up match (week ${run.week})`,
      back: 'Continue',
      // "Feed me": a captain's buff on you for the first 8 points
      setup: m => {
        if (kind === 'cup' && you.cap && run.talk === 'feed') {
          m.buff[you.id] = { lv: 2, n: 8 };
          elBuff(m, you); // an unlocked element: the gauge starts full
        }
      },
      onFinish: m => Cup.result(run, m, kind, bm),
      onLeave: () => navigate('career')
    };
  },
  /** Your grade for one match (S–C) from your own line. */
  grade(s, win) {
    const v = s.k + 1.2 * s.blk + 1.2 * s.ace + 0.4 * s.dig + 0.35 * s.ast - s.err + (win ? 1 : 0);
    return GRADES.find(([, min]) => v >= min);
  },
  /** Did you hit your pre-match focus? */
  focusMet(run, s) {
    const f = run.focus && (FOCUS[Run.you(run).role] || []).find(x => x[0] === run.focus);
    if (!f) return null;
    return f[2] === 'err' ? s.err <= f[3] : s[f[2]] >= f[3];
  },
  /** Rewards after one of your matches. Returns the message shown on the result card (plain text). */
  result(run, m, kind, bm) {
    const win = m.winner === 0,
      you = Run.you(run),
      s = m.stat[you.id] || blank(),
      plays = s.k + s.blk + s.ace,
      def = Run.cupDef(run),
      mul = kind === 'cup' ? def.mul : 1,
      [grade, , gmul] = Cup.grade(s, win),
      R0 = kind === 'cup' ? (win ? REWARDS.cupWin : { sp: 0, fans: 0, bond: 0 }) : win ? REWARDS.warmupWin : REWARDS.warmupLoss;
    const sp = Math.round((R0.sp + plays * REWARDS.perPlay.sp) * mul * gmul),
      fans = Math.round((R0.fans + plays * REWARDS.perPlay.fans) * mul * gmul * Sponsors.fanMul(run));
    const out = [Run.bump(run, 'sp', sp), Run.bump(run, 'fans', fans)];
    if (grade === 'S') out.push(Run.bump(run, 'mood', 1));
    if (R0.bond) {
      for (const q of Run.mates(run)) Run.bond(run, q.id, R0.bond);
      out.push(`+${R0.bond} bond with everyone`);
    }
    const fm = Cup.focusMet(run, s);
    if (fm) out.push('focus met', Run.bump(run, 'sp', FOCUS_REWARD.sp), Run.bump(run, 'fans', FOCUS_REWARD.fans));
    else if (fm === false) out.push('focus missed');
    run.plays.k += s.k;
    run.plays.blk += s.blk;
    run.plays.ace += s.ace;
    run.grades = [...(run.grades || []), grade];
    run.focus = null;
    out.push(ElTrial.match(run, m, grade));
    Sponsors.match(run, win, grade);
    const sc = m.setScores[0],
      score = `${sc[0]}-${sc[1]}`,
      opp = m.t[1];
    const line = `${win ? 'Won' : 'Lost'} ${score} vs ${opp.name} · grade ${grade}. You: ${s.k} kills, ${s.blk} blocks, ${s.ace} aces · ${out.filter(Boolean).join(', ')}`;
    Run.log(run, line);
    if (kind === 'warmup') {
      run.warm.push({ week: run.week, vs: opp.i, win, score, grade });
      Run.endWeek(run);
    } else {
      run.talk = null;
      bm.w = win ? run.team : opp.i;
      bm.res = bm.a === run.team ? [sc[0], sc[1]] : [sc[1], sc[0]];
      if (!win) Cup.close(run, bm.round);
      else if (bm.round === 'Final') Cup.close(run, 'Champion');
      else Run.save(run);
    }
    return line;
  },
  /** Your cup is over (knocked out in `place`, or 'Champion'): placement rewards; the season goes on or ends. */
  close(run, place) {
    const def = Run.cupDef(run);
    Cup.finishBracket(run);
    const P = PLACES[place] || { fans: 0, sp: 0 },
      out = [Run.bump(run, 'fans', Math.round(P.fans * def.mul)), Run.bump(run, 'sp', Math.round(P.sp * def.mul))];
    run.cups.push({ id: def.id, place, champ: bracketChampion(run.cup.sched) });
    Run.log(
      run,
      `${place === 'Champion' ? `${Run.myTeam(run).name} win the ${def.name}!` : `Out of the ${def.name} in the ${place.toLowerCase()}.`} ${out.filter(Boolean).join(', ')}`
    );
    if (CUPS.indexOf(def) < CUPS.length - 1) {
      run.cup.done = true;
      Run.nextWeek(run);
      Run.save(run);
    } else Cup.end(run, place);
  },
  /** End the run: rank, Legacy points (and a Hall of Fame entry). place = your Grand Cup finish. */
  end(run, place) {
    const you = Run.you(run),
      rank = rankOf(run.fans),
      stats = { ...Object.fromEntries(STATK.map(k => [k, you[k]])), wit: you.wit, lead: you.lead };
    const el = you.elSeen || you.elOn ? { el: you.el, sig: you.sig, elOn: !!you.elOn } : {};
    Run.snap(run);
    const earned = Legacy.record({ name: you.name, role: you.role, fans: run.fans, rank, place, cups: run.cups, pure: run.pure, mode: run.mode, stats, skills: you.skills, ...el });
    run.result = { place, rank, earned, cups: run.cups, champ: bracketChampion(run.cup.sched) };
    Run.save(run);
  }
};
