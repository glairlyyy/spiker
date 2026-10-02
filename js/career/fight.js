// Fights outside the schedule: street battles (clash), team challenges, the street crew you hire when alone, losing
// (stamina, standing, a Gazette jab) and injuries. Split from cup.js (T-085); the match plumbing (record, result, grades) stays in `Cup`.

const Fight = {
  /**
   * A street battle you fight (owner request): your side's crew (drawn from its pool, you on court in your role) vs the other
   * side's crew — a real match like an evaluation (XP, techniques, grade). Nothing is spent until it finishes; leaving early
   * leaves the battle open. Returns null if you can't go now.
   */
  clash(run, side) {
    const c = City.clashSite(run);
    if (!c || run.event || City.fightBan(run) || City.noTime(run, City.clashCost(run)) || (side !== c.a && side !== c.b)) return null;
    const foe = side === c.a ? c.b : c.a,
      you = Run.you(run),
      ids = Pool.draw(run, side, 1)[0].map(p => p.id);
    if (!ids.includes(you.id)) {
      // you take the same-role seat on court (else the last one); the player you replace drops to the bench
      let k = ['S', 'MB', 'WS', 'WS'].indexOf(you.role);
      k = k < 0 ? 3 : k;
      ids.splice(k, 1, you.id);
    }
    const mine = Eval.squad(run, ids, `${REGIONS[side].name} crew`, REGIONS[side].color, side, side.slice(0, 3).toUpperCase()),
      opp = Eval.squad(
        run,
        Pool.draw(run, foe, 1)[0].map(p => p.id),
        `${REGIONS[foe].name} crew`,
        REGIONS[foe].color,
        foe,
        foe.slice(0, 3).toUpperCase()
      );
    Eval.lend(run, mine);
    Eval.lend(run, opp);
    Cup.prepare(run, opp, 'clash', mine);
    const rel = Rel.matchFlags(run, mine, opp);
    return {
      a: mine,
      b: opp,
      round: `Street battle: ${REGIONS[c.a].name} vs ${REGIONS[c.b].name} · ${c.name}`,
      back: 'Continue',
      rel,
      setup: m => (m.rel = rel),
      onFinish: m => {
        Eval.restore();
        return Fight.clashResult(run, m, side, foe);
      },
      onLeave: () => {
        Eval.restore();
        navigate('career');
      }
    };
  },
  /** A street crew for hire (alone): an Academy-style squad of CHALLENGE.hire.ovr players with you in your role's seat. */
  hired(run) {
    const you = Run.you(run),
      used = new Set(
        run.teams.concat(Object.values(run.reserve || {}), run.pickup ? [run.pickup] : []).flatMap(x => squadOf(x).map(p => p.name))
      ),
      T = World.pickup(used);
    T.name = 'Street crew';
    T.short = 'STR';
    for (const p of squadOf(T)) {
      const d = CHALLENGE.hire.ovr - ovr(p);
      for (const k of STATK) p[k] = clamp(p[k] + d, 25, 99);
    }
    let k = T.P.findIndex(p => p.role === you.role);
    k = k < 0 ? 3 : k;
    T.P[k] = you;
    [T.s, T.mb] = T.P;
    T.ws = [T.P[2], T.P[3]];
    T.cap = T.P.reduce((a, p) => (p.lead > a.lead ? p : a), T.P[0]);
    T.ovr = teamOvr(T);
    return T;
  },
  /** This week's duo (T-063): the mate who asked takes a seat on your side (the lowest-OVR starter of their role, else the lowest). True if there is a duo. */
  duoIn(run, T) {
    const d = run.duo,
      mate = d && d.week === run.week && squadOf(T).find(p => p.id === d.id);
    if (!mate) return false;
    run.duo = null; // used: it was your next challenge this week
    if (T.P.includes(mate)) return true;
    const you = Run.you(run),
      pool = T.P.filter(p => p !== you),
      same = pool.filter(p => p.role === mate.role),
      out = (same.length ? same : pool).reduce((a, b) => (ovr(b) < ovr(a) ? b : a)),
      k = T.P.indexOf(out);
    T.P[k] = mate;
    T.bench = (T.bench || []).map(p => (p === mate ? out : p));
    T.P.forEach((p, i) => (p.slot = ['S', 'MB', 'W0', 'W1'][i]));
    [T.s, T.mb] = T.P;
    T.ws = [T.P[2], T.P[3]];
    T.ovr = teamOvr(T);
    return true;
  },
  /**
   * A team challenge you take (spec §4.15): your side (Academy squad, your club's squad, or a hired street crew) against club
   * ti's squad, a real match like a street battle. Nothing is spent until it finishes. Null if the club wouldn't accept now.
   */
  challenge(run, ti, stake = 0, force = false) {
    const side = City.challengeSide(run),
      W = City.worth(run, ti, stake);
    if (
      !W ||
      (!force && !W.accepts) ||
      run.event ||
      City.fightBan(run) ||
      City.noTime(run, City.scoutCost(run, ti)) ||
      run.money < side.cost
    )
      return null;
    stake = clamp(Math.round(stake) || 0, 0, City.stakeMax(run));
    const opp = run.teams[ti],
      mine = side.kind === 'hired' ? Fight.hired(run) : side.T;
    if (side.kind === 'hired') Eval.lend(run, mine);
    Cup.prepare(run, opp, 'challenge', mine);
    Run.lineup(run, mine, City.myRegion(run));
    if (Fight.duoIn(run, mine)) stake = Math.round(stake / 2); // a mate fights beside you: the stake is split
    Run.lineup(run, opp, null);
    const rel = Rel.matchFlags(run, mine, opp);
    return {
      a: mine,
      b: opp,
      round: `Challenge: ${mine.name} vs ${opp.name}${stake ? ` · stake $${stake}` : ''}`,
      back: 'Continue',
      rel,
      setup: m => (m.rel = rel),
      onFinish: m => {
        Eval.restore();
        return Fight.challengeResult(run, m, ti, stake, side);
      },
      onLeave: () => {
        Eval.restore();
        navigate('career');
      }
    };
  },
  /** The price of a lost challenge / street fight (LOSS): stamina and mood; standing with `region` (challenges: null for a street fight, which keeps CLASH.lose); a heavy loss costs fans and a Gazette jab. Pushes labels onto `out`. */
  lose(run, club, margin, region, out) {
    const L = LOSS;
    out.push(Run.bump(run, 'sta', -L.sta), Run.bump(run, 'mood', L.mood));
    if (region) {
      const n = (run.losses[region] = (run.losses[region] || 0) + 1);
      out.push(City.repBump(run, region, L.rep + (n >= L.repeat ? L.repeatRep : 0)));
    }
    if (margin >= L.heavy) {
      out.push(Run.bump(run, 'fans', L.fans));
      Run.news(
        run,
        GAZETTE_JABS[Math.floor(hstr(`${run.week}|${club}`) * GAZETTE_JABS.length)]
          .replace('{name}', Run.you(run).name)
          .replace('{club}', club)
      );
    }
  },
  /** One injury roll after a challenge / street fight, win or lose (INJURY; `risk` from City.injuryRisk). Returns the diary text ('' if unhurt). */
  injure(run, risk) {
    const I = INJURY;
    if (R() >= risk) return '';
    const roll = R(),
      sev = roll < I.sev[0] ? 'minor' : roll < I.sev[1] ? 'serious' : 'severe',
      weeks = I.weeks[sev];
    run.injury = { weeks: Math.max(weeks, run.injury ? run.injury.weeks : 0) };
    const lost = sev === 'severe' ? Run.bump(run, STATK[Math.floor(((roll * 997) % 1) * STATK.length)], -I.lose) : '';
    return `Injured: ${sev} — ${weeks} week${weeks > 1 ? 's' : ''} of light training${lost ? `. ${lost} for good` : ''}`;
  },
  /** After a challenge: the trip + a day, the stake at odds (or lost), the crew's pay, standing, fans, match XP, techniques, street points. Returns the log line. */
  challengeResult(run, m, ti, stake, side) {
    const t = run.teams[ti],
      r = FACTIONS[ti].region,
      win = m.winner === 0,
      you = Run.you(run),
      s = m.stat[you.id] || blank(),
      [grade, , gmul] = Cup.grade(s, win),
      sc = m.setScores[0],
      margin = win ? 0 : Math.max(0, sc[1] - sc[0]),
      risk = City.injuryRisk(run, t.ovr, margin), // (before the trip, the day and the match's tiredness are counted)
      trip =
        (Cup.record(run, m, 'challenge', { stake }),
        City.go(run, CITY.hq[ti], { k: 'challenge', label: 'Challenge', at: run.teams[ti].name })),
      out = [Growth.matchXp(run, m), Skills.tryLearn(run, m)];
    if (win) Rel.beatMe(run, m);
    if (side.cost) {
      const pay = Math.min(run.money, side.cost);
      run.money -= pay;
      out.push(`−$${pay} for the crew`);
    }
    stake = Math.min(stake, run.money);
    if (win) {
      const odds = clamp(1.5 + (t.ovr - m.t[0].ovr) / 20, CHALLENGE.odds[0], CHALLENGE.odds[1]),
        gain = Math.round(stake * odds);
      run.money += gain;
      if (stake) out.push(`+$${gain} (stake ×${odds.toFixed(1)})`);
      out.push(City.repBump(run, r, CLASH.win), Run.bump(run, 'fans', Math.round(CLASH.fans * gmul)));
    } else {
      if (stake) {
        run.money -= stake;
        out.push(`−$${stake} stake`);
      }
      Fight.lose(run, t.name, margin, r, out);
    }
    out.push(Run.bump(run, 'sta', -CLASH.sta));
    Rank.points(run, you.id, RANK.street.fight + (win ? RANK.street.win : 0));
    Rank.meet(run, m);
    run.plays.k += s.k;
    run.plays.blk += s.blk;
    run.plays.ace += s.ace;
    run.focus = null;
    out.push(Fight.injure(run, risk));
    run.lastFight = Run.dayNo(run);
    const line = `${trip}Challenged ${t.name} — ${win ? 'won' : 'lost'} ${sc[0]}-${sc[1]}, grade ${grade}. You: ${s.k} kills, ${s.blk} blocks, ${s.ace} aces · ${out.filter(Boolean).join(', ')}`;
    Run.log(run, line);
    Run.save(run);
    return line;
  },
  /** After a street battle you fought: the trip + a day, stamina, standing, fans, match XP, techniques; the front moves. Returns the log line. */
  clashResult(run, m, side, foe) {
    const c = City.clashSite(run),
      win = m.winner === 0,
      you = Run.you(run),
      s = m.stat[you.id] || blank(),
      [grade, , gmul] = Cup.grade(s, win),
      sc = m.setScores[0],
      margin = win ? 0 : Math.max(0, sc[1] - sc[0]),
      risk = City.injuryRisk(run, City.crewOvr(run, foe), margin),
      trip = (Cup.record(run, m, 'street'), City.go(run, c.at, { k: 'battle', label: 'Fight', at: c.name })),
      out = [Growth.matchXp(run, m), Skills.tryLearn(run, m)];
    if (win) Rel.beatMe(run, m);
    run.clash.done = true;
    const front = Front.result(run, win ? side : foe, win ? foe : side);
    Rank.points(run, you.id, RANK.street.fight + (win ? RANK.street.win : 0));
    Rank.settle(run, win ? side : foe);
    Rank.meet(run, m);
    out.push(City.repBump(run, side, win ? CLASH.win : CLASH.lose), City.repBump(run, foe, CLASH.other), Run.bump(run, 'sta', -CLASH.sta));
    if (win) out.push(Run.bump(run, 'fans', Math.round(CLASH.fans * gmul)));
    else Fight.lose(run, `${REGIONS[foe].name} crew`, margin, null, out);
    run.plays.k += s.k;
    run.plays.blk += s.blk;
    run.plays.ace += s.ace;
    run.focus = null;
    out.push(Fight.injure(run, risk));
    run.lastFight = Run.dayNo(run);
    const line = `${trip}Fought for ${REGIONS[side].name} in the street battle — ${win ? 'won' : 'lost'} ${sc[0]}-${sc[1]}, grade ${grade}. You: ${s.k} kills, ${s.blk} blocks, ${s.ace} aces · ${out.filter(Boolean).join(', ')}${front ? `. ${front}!` : ''}`;
    Run.log(run, line);
    Run.save(run);
    return line;
  }
};
