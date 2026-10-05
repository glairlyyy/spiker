// Court matches at the official venues (spec §4.21a, T-229): pick-up games against a squad drawn from the league at the
// week's level (an ace now and then). Three tiers (COURT): an entry fee, a win pays COURT.prize × the fee and fans; a loss
// costs only the fee (no mood, no standing, half the street injury risk — the venue has medics). DOM-free.

const Court = {
  /** A tier by id (null if unknown). */
  tier: id => COURT.tiers.find(t => t.id === id) || null,
  /** The league's mean player OVR this week (every club squad; the named players — never drawn — left out). */
  mean(run) {
    const P = run.teams.flatMap(t => squadOf(t)).filter(p => !p.named);
    return P.length ? P.reduce((a, p) => a + ovr(p), 0) / P.length : 50;
  },
  /** The opponents' target OVR for a tier this week. */
  target: (run, tier) => Math.round(Court.mean(run) + Court.tier(tier).off),
  /** Days a court match at venue id takes: the trip + a day. */
  cost: (run, id) => City.trip(run, VENUES[id].at) + 1,
  /** Why you can't play a court match at venue id in this tier now ('' if you can). */
  why(run, id, tier) {
    const v = VENUES[id],
      T = Court.tier(tier);
    if (!v || !T) return 'unknown';
    const wt = Run.weekType(run);
    if (wt !== 'train' && wt !== 'camp') return 'not in a match week';
    if (run.event) return 'answer the event first';
    const ban = Fight.ban(run);
    if (ban) return ban;
    if (City.outside(run, v.at)) return City.fence(run);
    const late = City.noTime(run, Court.cost(run, id));
    if (late) return late;
    const need = T.fee + Fight.challengeSide(run).cost;
    return run.money < need ? `needs $${need}` : '';
  },
  /**
   * The opponents: 6 league players (club squads and reserves; never `mine`, never you, never a named player) — a random pick of
   * the COURT.pool nearest the target OVR, seated by role [S, MB, WS, WS] then 2 on the bench; an ace roll may give one seat to a
   * named player not on your side. Returns { T, ace } (T: a temporary squad, not lent yet; ace: the named player or null).
   */
  draw(run, id, tier, mine) {
    const v = VENUES[id],
      T0 = Court.tier(tier),
      target = Court.target(run, tier),
      you = Run.you(run),
      ours = new Set(squadOf(mine)),
      all = run.teams
        .flatMap(t => squadOf(t))
        .concat(Object.values(run.reserve || {}).flatMap(t => squadOf(t)))
        .filter(p => p !== you && !p.named && !ours.has(p)),
      byNear = [...new Set(all)].sort((a, b) => Math.abs(ovr(a) - target) - Math.abs(ovr(b) - target)),
      near = byNear.slice(0, COURT.pool),
      take = list => list.splice(Math.floor(R() * list.length), 1)[0],
      P = [];
    for (const role of ['S', 'MB', 'WS', 'WS']) {
      const fit = near.filter(p => p.role === role),
        // none of the role among the nearest: the nearest of that role in the league
        p = fit.length ? fit[Math.floor(R() * fit.length)] : byNear.find(q => q.role === role && !P.includes(q)) || near[0];
      if (near.includes(p)) near.splice(near.indexOf(p), 1);
      P.push(p);
    }
    const bench = [take(near), take(near)].filter(Boolean);
    let ace = null;
    if (R() < T0.ace) {
      const aces = Stars.all(run).filter(p => !ours.has(p) && p !== you);
      if (aces.length) {
        ace = aces[Math.floor(R() * aces.length)];
        const k = Math.max(
          0,
          P.findIndex(p => p.role === ace.role)
        );
        P[k] = ace;
      }
    }
    const T = {
      i: -2,
      name: `${v.name} regulars`,
      short: 'REG',
      color: (REGIONS[v.region] || REGIONS.open).color,
      sk: 'balanced',
      S: STYLES.balanced,
      hist: { w: 0, l: 0, sw: 0, sl: 0, res: [] },
      nStars: 0,
      arch: 'Court regulars',
      coachIQ: 0.6,
      P,
      bench
    };
    [T.s, T.mb] = P;
    T.ws = [P[2], P[3]];
    T.cap = P.reduce((a, p) => (p.lead > a.lead ? p : a), P[0]);
    T.ovr = teamOvr(T);
    return { T, ace };
  },
  /**
   * A court match at venue id in a tier (spec §4.21a): your challenge side (club / Academy squad / a hired crew) vs the drawn
   * regulars. Nothing is spent until it finishes (Court.result); leaving early spends nothing. Null if you can't play now.
   */
  fixture(run, id, tier) {
    if (Court.why(run, id, tier)) return null;
    const v = VENUES[id],
      T0 = Court.tier(tier),
      side = Fight.challengeSide(run),
      mine = side.kind === 'hired' ? Fight.hired(run) : side.T;
    if (side.kind === 'hired') Eval.lend(run, mine);
    const { T: opp, ace } = Court.draw(run, id, tier, mine);
    Eval.lend(run, opp);
    Cup.prepare(run, opp, 'court', mine);
    Run.lineup(run, mine, City.myRegion(run), false, true); // your entry: you start in your role's seat (an injured you can't enter)
    const rel = Rel.matchFlags(run, mine, opp);
    return {
      a: mine,
      b: opp,
      round: `Court match (${T0.name}) · ${v.name}${ace ? ` · an ace showed up: ${ace.name}` : ''}`,
      back: 'Continue',
      rel,
      ace: ace ? ace.name : null,
      setup: m => (m.rel = rel),
      onFinish: m => {
        Eval.restore();
        return Court.result(run, m, id, tier, side, ace);
      },
      onLeave: () => Eval.restore() // the UI then returns to the hub (watchCareer)
    };
  },
  /** After a court match: the trip + a day, the fee, the crew's pay, stamina, match XP, techniques; a win pays the prize and fans; the injury roll at half the street risk. Returns the log line. */
  result(run, m, id, tier, side, ace = null) {
    const v = VENUES[id],
      T0 = Court.tier(tier),
      win = m.winner === 0,
      you = Run.you(run),
      s = m.stat[you.id] || blank(),
      [grade, , gmul] = Cup.grade(s, win),
      sc = m.setScores[0],
      margin = win ? 0 : Math.max(0, sc[1] - sc[0]),
      risk = Fight.injuryRisk(run, m.t[1].ovr, margin) * COURT.injury, // (before the trip and the day are counted, as for a challenge)
      trip = (Cup.record(run, m, 'court', { round: T0.name }), City.go(run, v.at, { k: 'battle', label: 'Court', at: v.name })),
      out = [Growth.matchXp(run, m), Skills.tryLearn(run, m)];
    if (win) Rel.beatMe(run, m);
    const fee = Math.min(run.money, T0.fee);
    run.money -= fee;
    out.push(`−$${fee} entry`);
    if (side.cost) {
      const pay = Math.min(run.money, side.cost);
      run.money -= pay;
      out.push(`−$${pay} for the crew`);
    }
    if (win) {
      const prize = Math.round(T0.fee * COURT.prize);
      run.money += prize;
      out.push(`+$${prize} prize`, Run.bump(run, 'fans', Math.round(T0.fans * gmul)));
    }
    out.push(Run.bump(run, 'sta', -COURT.sta));
    Rank.meet(run, m);
    run.plays.k += s.k;
    run.plays.blk += s.blk;
    run.plays.ace += s.ace;
    run.focus = null;
    out.push(Fight.injure(run, risk));
    run.lastFight = Run.dayNo(run);
    const line = `${trip}Court match (${T0.name}) at ${v.name}${ace ? ` — an ace showed up: ${ace.name}` : ''} — ${win ? 'won' : 'lost'} ${sc[0]}-${sc[1]}, grade ${grade}. You: ${s.k} kills, ${s.blk} blocks, ${s.ace} aces · ${out.filter(Boolean).join(', ')}`;
    Run.log(run, line);
    Run.save(run);
    return line;
  }
};
