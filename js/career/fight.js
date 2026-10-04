// Fights outside the schedule: street battles (clash: the weekly roll, watch, fight, the week-end sim), team challenges
// (worth, offer, the match), the street crew you hire when alone, losing (stamina, standing, a Gazette jab) and injuries. Split from cup.js (T-085); the match plumbing (record, result, grades) stays in `Cup`.

const Fight = {
  /**
   * A street battle you fight (owner request): your side's crew (drawn from its pool, you on court in your role) vs the other
   * side's crew — a real match like an evaluation (XP, techniques, grade). Nothing is spent until it finishes; leaving early
   * leaves the battle open. Returns null if you can't go now.
   */
  clash(run, side) {
    const c = Fight.clashSite(run);
    if (!c || run.event || Fight.ban(run) || City.noTime(run, Fight.clashCost(run)) || (side !== c.a && side !== c.b)) return null;
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
      onLeave: () => Eval.restore() // the UI then returns to the hub (watchCareer)
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
    const side = Fight.challengeSide(run),
      W = Fight.worth(run, ti, stake);
    if (!W || (!force && !W.accepts) || run.event || Fight.ban(run) || City.noTime(run, City.scoutCost(run, ti)) || run.money < side.cost)
      return null;
    stake = clamp(Math.round(stake) || 0, 0, Fight.stakeMax(run));
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
      onLeave: () => Eval.restore() // the UI then returns to the hub (watchCareer)
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
  /** One injury roll after a challenge / street fight, win or lose (INJURY; `risk` from Fight.injuryRisk). Returns the diary text ('' if unhurt). */
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
      risk = Fight.injuryRisk(run, t.ovr, margin), // (before the trip, the day and the match's tiredness are counted)
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
    const c = Fight.clashSite(run),
      win = m.winner === 0,
      you = Run.you(run),
      s = m.stat[you.id] || blank(),
      [grade, , gmul] = Cup.grade(s, win),
      sc = m.setScores[0],
      margin = win ? 0 : Math.max(0, sc[1] - sc[0]),
      risk = Fight.injuryRisk(run, Fight.crewOvr(run, foe), margin),
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
  },
  /** A training week may open with a street battle: an aggressor raids a neighbour (run.clash, over at the week's end). */
  clashRoll(run) {
    run.clash = null;
    const wt = Run.weekType(run);
    if ((wt !== 'train' && wt !== 'camp') || R() >= CLASH.chance) return;
    const { att, def } = Front.pick(run),
      t = Hex.target(run, att, def); // fought on the defender's cheapest, nearest tile (spec §4.27)
    if (t) run.clash = { tile: t.id, from: t.from, att, def, seen: false, done: false };
  },
  /** A battle nobody joined is settled at the week's end. Returns the diary line. */
  clashEnd(run) {
    const c = Fight.clashSite(run);
    if (!c) return '';
    run.clash.done = true;
    const w = Front.sim(run, c.a, c.b, run.clash.att),
      l = w === c.a ? c.b : c.a,
      s = Front.result(run, w, l);
    Rank.settle(run, w);
    return `Street battle: ${REGIONS[w].name} beat ${REGIONS[l].name}${s ? ` — ${s}` : ''}.`;
  },
  /** Why you can't fight or challenge now ('' if you can): an injury keeps you off the street (spec §4.15). */
  ban: run => (run.injury ? 'Injured — rest first' : City.fence(run)), // (battles and challenges are never on campus)
  /**
   * The chance of an injury after a challenge / street fight (INJURY; pure, no roll): their rating above yours, the points you
   * lose by (`margin`, 0 before the match), low stamina, and a fight soon after your last one.
   */
  injuryRisk(run, oppRating, margin = 0) {
    const I = INJURY,
      since = run.lastFight == null ? Infinity : Run.dayNo(run) - run.lastFight,
      v =
        I.base +
        Math.max(0, oppRating - ovr(Run.you(run))) * I.perGap +
        margin * I.perPoint +
        (1 - run.sta / run.staMax) * I.sta +
        Math.max(0, I.cool - since) * I.perDay;
    return clamp(v, 0, I.max);
  },
  /** The rating of a faction's league clubs (their crew in a street fight), 60 if it has none. */
  crewOvr(run, region) {
    const ts = run.teams.filter(t => FACTIONS[t.i] && FACTIONS[t.i].region === region);
    return ts.length ? ts.reduce((a, t) => a + t.ovr, 0) / ts.length : 60;
  },
  /** Who you challenge with: the Academy squad, your club's squad, or (alone) a hired street crew. */
  challengeSide(run) {
    if (run.team != null) return { kind: 'club', T: Run.myTeam(run), ovr: Run.myTeam(run).ovr, cost: 0 };
    if (run.academy !== false) return { kind: 'academy', T: run.pickup, ovr: run.pickup.ovr, cost: 0 };
    return { kind: 'hired', T: null, ovr: CHALLENGE.hire.ovr, cost: CHALLENGE.hire.cost };
  },
  /** Most you can stake (the hired crew is paid first). */
  stakeMax: run => Math.max(0, run.money - Fight.challengeSide(run).cost),
  /**
   * Would club ti take your challenge at this stake? { verdict: 'likely' | 'doubtful' | 'refuses', why, accepts, need, worth }
   * (null for your own club). Shown before you go as "Accepts: verdict — why"; the numbers stay hidden.
   */
  worth(run, ti, stake = 0) {
    const t = run.teams[ti],
      f = FACTIONS[ti];
    if (!t || !f || ti === run.team) return null;
    const C = CHALLENGE,
      r = f.region,
      you = Run.you(run),
      side = Fight.challengeSide(run),
      gaz = Rank.gazette(run).some(x => x.id === you.id),
      rep = City.rep(run, r),
      why = CHALLENGE_WHY[r] || CHALLENGE_WHY.wei;
    let term = 0;
    if (r === 'wei') term = (gaz ? C.wei.gazette : 0) + run.fans / C.wei.fansPer + stake / C.wei.stakePer;
    else if (r === 'wu') term = (you[KEYSTAT[you.role]] - 50) / C.wu.keyPer;
    else if (r === 'shu') term = Math.max(0, rep) / C.shu.repPer + run.week / C.shu.weekPer;
    const worth = side.ovr + rep / C.standPer + term,
      need = t.ovr - C.margin,
      by = worth >= need ? 'likely' : worth >= need - C.doubt ? 'doubtful' : 'refuses';
    let verdict = by,
      text = why[by];
    if (r === 'outlaws') [verdict, text] = stake >= C.outlaws.minStake ? ['likely', why.likely] : ['refuses', why.refuses];
    else if (r === 'gloria' && !gaz) [verdict, text] = ['refuses', why.refuses];
    if (run.refused && run.refused[ti] && run.refused[ti].week === run.week) [verdict, text] = ['refuses', CHALLENGE_WHY.week];
    const accepts = verdict === 'likely' || (verdict === 'doubtful' && hstr(`${run.week}|${ti}|${stake}`) < C.doubtP);
    return { verdict, why: text, accepts, need, worth };
  },
  /**
   * Challenge club ti for a stake. null = can't now (event open, no days, no money for the crew). Accepted → { accepted: true,
   * stake }: nothing is spent yet — the match is Fight.challenge and Fight.challengeResult spends the trip + day. Refused →
   * the trip + a day are spent, the club won't hear you again this week, and { accepted: false, line } is the diary line.
   */
  offer(run, ti, stake = 0) {
    const side = Fight.challengeSide(run);
    stake = clamp(Math.round(stake) || 0, 0, Fight.stakeMax(run));
    const W = Fight.worth(run, ti, stake);
    if (!W || run.event || Fight.ban(run) || City.noTime(run, City.scoutCost(run, ti)) || run.money < side.cost) return null;
    if (W.accepts) return { accepted: true, stake };
    const t = run.teams[ti],
      r = FACTIONS[ti].region,
      lines = CHALLENGE_LINES[r] || CHALLENGE_LINES.wei,
      trip = City.go(run, CITY.hq[ti], { k: 'challenge', label: 'Refused', at: t.name }),
      rf = (run.refused[ti] = { week: run.week, n: ((run.refused[ti] && run.refused[ti].n) || 0) + 1 }),
      pest = rf.n >= CHALLENGE.refuseMax ? City.repBump(run, r, CHALLENGE.pest) : '';
    return {
      accepted: false,
      line: `${trip}${t.name} turned your challenge down: “${pick(lines)}”${pest ? ` You are becoming a pest (${pest}).` : ''}`
    };
  },
  /** This week's open battle: { a: raider, b: defender, at, name, tile } (null when none or fought). */
  clashSite(run) {
    const c = run.clash,
      t = c && !c.done && Hex.tile(c.tile);
    return t ? { a: c.att, b: c.def, at: t.at, name: Hex.name(t.id), tile: t.id } : null;
  },
  clashCost: run => City.trip(run, Fight.clashSite(run).at) + 1,
  /** Go to the battle and watch it (side null). Returns the diary line. Fighting is Fight.clash(run, side), a real match. */
  watch(run, side) {
    const c = Fight.clashSite(run);
    if (!c || run.event || City.noTime(run, Fight.clashCost(run)) || City.outside(run, c.at) || (side && side !== c.a && side !== c.b))
      return '';
    const trip = City.go(run, c.at, { k: 'battle', label: 'Watch', at: c.name }),
      out = [];
    run.clash.done = true;
    const vs = `${REGIONS[c.a].name} vs ${REGIONS[c.b].name}`;
    if (!side) {
      for (const t of run.teams) if ([c.a, c.b].includes(FACTIONS[t.i].region)) (run.scout || (run.scout = {}))[t.i] = run.week;
      const w = Front.sim(run, c.a, c.b, run.clash.att),
        s = Front.result(run, w, w === c.a ? c.b : c.a);
      Rank.settle(run, w);
      out.push(Run.bump(run, 'sta', -CLASH.watchSta));
      return `${trip}Watched the street battle (${vs}): ${REGIONS[w].name} won${s ? ` — ${s}` : ''}; both sides' clubs scouted. ${out.filter(Boolean).join(', ')}`;
    }
    return ''; // fighting is a real match: Fight.clash(run, side)
  }
};
