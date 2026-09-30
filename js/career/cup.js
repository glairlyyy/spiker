// Career matches: evaluations, the U21 Final Cup (after week 28), match grades, pre-match focus, the captain's team
// talk, placement rewards and the end of a run.

/** Cup "placing" for a player whose squad was not in it. */
const NO_CUP = 'Did not play';
const Cup = {
  /** How a cup went for you, in words. */
  placeText: p => (p === 'Champion' ? '🏆 Champion' : p === NO_CUP ? 'did not play' : `out in the ${p.toLowerCase()}`),
  /** Squad number as a roman numeral (1 → I). */
  roman: n => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][n - 1] || String(n),
  /** Every squad of the U21 Final Cup: each faction's pool drawn into squads, then the Academy squad while you are still in it. */
  entrants(run) {
    const out = [];
    for (const r of Object.keys(POOL)) {
      Pool.draw(run, r).forEach((sq, i) =>
        out.push({
          name: `${REGIONS[r].name} ${Cup.roman(i + 1)}`,
          short: `${r.slice(0, 3).toUpperCase()}${i + 1}`,
          color: REGIONS[r].color,
          region: r,
          ids: sq.map(p => p.id),
          academy: false
        })
      );
    }
    if (World.isFree(run) && run.academy !== false && run.pickup) {
      const T = run.pickup;
      out.push({ name: T.name, short: T.short, color: T.color, region: null, ids: squadOf(T).map(p => p.id), academy: true });
    }
    return out;
  },
  /** Entrant i of the running cup as a playable squad (the Academy entrant is your real pickup squad). Lend it before a match. */
  team(run, i) {
    const e = run.cup.entrants[i];
    if (e.academy) return run.pickup;
    const T = Eval.squad(run, e.ids, e.name, e.color, e.region);
    T.short = e.short;
    return T;
  },
  /** A cup begins: stamina refills; the squads are drawn and seeded by rating (1 plays 16, 8 plays 9, …; missing seeds are byes). */
  start(run, def) {
    run.sta = run.staMax;
    const E = Cup.entrants(run),
      you = Run.you(run),
      me = E.findIndex(e => e.ids.includes(you.id)),
      ranked = E.map((e, i) => i)
        .map(i => [i, Eval.squad(run, E[i].ids, E[i].name, E[i].color, E[i].region).ovr])
        .sort((a, b) => b[1] - a[1])
        .map(x => x[0]),
      order = seedOrder(16).map(s => (s <= ranked.length ? ranked[s - 1] : null));
    run.cup = { id: def.id, entrants: E, me, sched: newBracket(order), done: false };
    Run.log(run, `The ${def.name} begins: ${E.length} squads, seeded by rating. Stamina refilled.`);
    if (me < 0) {
      Run.log(run, `You watch the ${def.name} from the stands.`);
      Cup.close(run, NO_CUP);
    }
  },
  /** Your next Cup match; other matches of earlier slots in the round are simulated first. */
  next(run) {
    const S = run.cup.sched;
    for (;;) {
      const m = advanceBracket(S);
      if (!m) return null;
      if (m.a === run.cup.me || m.b === run.cup.me) return m;
      Cup.simulate(run, m);
    }
  },
  /** Play a bracket entry you are not in headlessly and record its winner and score (both squads lent, then restored). */
  simulate(run, x) {
    const A = Cup.team(run, x.a),
      B = Cup.team(run, x.b);
    Eval.lend(run, A);
    Eval.lend(run, B);
    const m = simMatch(A, B),
      sc = m.setScores[0];
    Eval.restore();
    x.w = m.winner === 0 ? x.a : x.b;
    x.res = [sc[0], sc[1]];
  },
  /** Everything after you are knocked out or crowned: finish the bracket in the background. */
  finishBracket(run) {
    let m;
    while ((m = advanceBracket(run.cup.sched))) Cup.simulate(run, m);
  },
  /** Match-day form: your mood, +0.1 per 80+ bond for your side, the captain's talk; noise for the opponents. */
  prepare(run, opp, kind, side = Run.myTeam(run)) {
    const you = Run.you(run),
      mine = side;
    const talk = kind === 'cup' && you.cap ? run.talk : null;
    for (const p of squadOf(mine)) {
      let f = Run.form(run, p);
      if (talk === 'fire' && p !== you) f += 0.35;
      if (talk === 'calm') f = Math.max(f, 0.2);
      p.form = +Math.min(1, f).toFixed(2);
    }
    for (const p of squadOf(opp)) p.form = +(rnd(-0.2, 0.2) - (talk === 'calm' ? 0.15 : 0)).toFixed(2);
  },
  /** Your side of the next career match: { T: the squad (a temporary one for a drawn squad), region: whose standing counts for your place }. */
  mine(run, kind) {
    if (kind === 'cup') return { T: Cup.team(run, run.cup.me), region: run.cup.entrants[run.cup.me].region };
    const e = Eval.setup(run),
      club = run.team != null ? run.teams[run.team] : null;
    if (e && e.kind === 'faction')
      return { T: Eval.squad(run, e.mine, `${club.name} · Eval`, club.color), region: FACTIONS[run.team].region };
    return { T: Run.myTeam(run), region: null }; // the Academy squad is a real team
  },
  /** Fixture for the match screen. kind: 'eval' | 'cup'. Your side is always on the left; your coach picks the 4 (Run.lineup). */
  fixture(run, kind) {
    const you = Run.you(run),
      def = Run.cupDef(run);
    let opp,
      round,
      bm = null;
    if (kind === 'cup') bm = Cup.next(run); // (simulates the other matches first: before your squad is lent)
    const side = Cup.mine(run, kind),
      mine = side.T;
    if (kind === 'eval') {
      // an evaluation: drawn squads (lent their players for the match); the Academy squad is a real team
      const e = Eval.setup(run);
      if (e.kind === 'faction') Eval.lend(run, mine);
      opp = Eval.squad(run, e.opp, `${REGIONS[e.region].name} · Eval`, REGIONS[e.region].color);
      Eval.lend(run, opp);
      round = `${e.kind === 'academy' ? 'Academy' : REGIONS[e.region].name} evaluation (week ${run.week})`;
    } else if (kind === 'cup') {
      opp = Cup.team(run, bm.a === run.cup.me ? bm.b : bm.a);
      Eval.lend(run, mine);
      Eval.lend(run, opp);
      round = `${def.name} ${bm.round}`;
    }
    Cup.prepare(run, opp, kind, mine);
    Run.lineup(run, mine, side.region);
    return {
      a: mine,
      b: opp,
      round,
      back: 'Continue',
      // "Feed me": a captain's buff on you for the first 8 points
      setup: m => {
        if (kind === 'cup' && you.cap && run.talk === 'feed') {
          m.buff[you.id] = { lv: 2, n: 8 };
          elBuff(m, you); // an unlocked element: the gauge starts full
        }
      },
      onFinish: m => {
        Eval.restore();
        return Cup.result(run, m, kind, bm);
      },
      onLeave: () => {
        Eval.restore();
        navigate('career');
      }
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
      played = m.played.has(you.id),
      part = played && !(m.lineup0[0].P.includes(you) && m.finished.has(you.id)), // started or finished on the bench
      sc = m.setScores[0],
      score = `${sc[0]}-${sc[1]}`,
      opp = m.t[1];
    let line,
      grade = null;
    if (!played) {
      // never came on: no grade, no win bonus — only the bench reward (wit XP)
      line = `${win ? 'Won' : 'Lost'} ${score} vs ${opp.name} · Watched from the bench: ${Eval.benchXp(run)}`;
      run.focus = null;
    } else {
      const plays = s.k + s.blk + s.ace,
        def = Run.cupDef(run),
        mul = (kind === 'cup' ? def.mul : 1) * (part ? BENCH.partMul : 1),
        [g, , gmul] = Cup.grade(s, win),
        R0 = kind === 'cup' ? (win ? REWARDS.cupWin : { sp: 0, fans: 0, bond: 0 }) : win ? REWARDS.warmupWin : REWARDS.warmupLoss;
      grade = g;
      const sp = Math.round((R0.sp + plays * REWARDS.perPlay.sp) * mul * gmul),
        fans = Math.round((R0.fans + plays * REWARDS.perPlay.fans) * mul * gmul * Sponsors.fanMul(run));
      const out = [
        Run.bump(run, 'sp', sp),
        Run.bump(run, 'fans', fans),
        World.prize(run, Math.round((kind === 'cup' ? (win ? ECON.cupWin : 0) : win ? ECON.warmupWin : ECON.warmupLoss) * mul))
      ];
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
      line = `${win ? 'Won' : 'Lost'} ${score} vs ${opp.name} · grade ${grade}${part ? ' (bench: rewards ×' + BENCH.partMul + ')' : ''}. You: ${s.k} kills, ${s.blk} blocks, ${s.ace} aces · ${out.filter(Boolean).join(', ')}`;
    }
    Run.log(run, line);
    if (kind === 'eval') {
      run.warm.push({ week: run.week, vs: opp.i, win: played && win, score, grade });
      Run.endWeek(run);
    } else {
      run.talk = null;
      const me = run.cup.me;
      bm.w = win ? me : bm.a === me ? bm.b : bm.a;
      bm.res = bm.a === me ? [sc[0], sc[1]] : [sc[1], sc[0]];
      if (!win) Cup.close(run, bm.round);
      else if (bm.round === 'Final') Cup.close(run, 'Champion');
      else Run.save(run);
    }
    return line;
  },
  /** Your cup is over (knocked out in `place`, 'Champion', or NO_CUP if your squad was not in it): placement rewards; the run ends. */
  close(run, place) {
    const def = Run.cupDef(run);
    Cup.finishBracket(run);
    const P = PLACES[place] || { fans: 0, sp: 0 },
      champ = run.cup.entrants[bracketChampion(run.cup.sched)].name,
      out = [
        Run.bump(run, 'fans', Math.round(P.fans * def.mul)),
        Run.bump(run, 'sp', Math.round(P.sp * def.mul)),
        World.prize(run, Math.round((ECON.place[place] || 0) * def.mul))
      ];
    run.cups.push({ id: def.id, place, champ });
    Run.log(
      run,
      place === NO_CUP
        ? `The ${def.name} is over — won by ${champ}.`
        : `${place === 'Champion' ? `${run.cup.entrants[run.cup.me].name} win the ${def.name}!` : `Out of the ${def.name} in the ${place.toLowerCase()}.`} ${out.filter(Boolean).join(', ')}`
    );
    Cup.end(run, place);
  },
  /** End the run: rank and result. place = your U21 Final Cup finish. */
  end(run, place) {
    const rank = rankOf(run.fans);
    Run.snap(run);
    run.result = { place, rank, cups: run.cups, champ: run.cups[run.cups.length - 1].champ };
    Run.save(run);
  }
};
