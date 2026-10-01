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
    if (run.mode && run.mode.story && !out.some(e => e.ids.includes(run.youId))) Cup.place(run, out);
    return out;
  },
  /**
   * Story (spec §4.26): you are always in the cup. Signed with a faction → you take the place of the weakest same-role
   * player (else the weakest player) of its first drawn squad; alone → the street crew entrant (`Cup.crew`). Mutates `out`.
   */
  place(run, out) {
    const you = Run.you(run);
    if (World.isFree(run)) return out.push(Cup.crew(run));
    const r = FACTIONS[run.team].region,
      e = out.find(x => x.region === r);
    if (!e) return out.push(Cup.crew(run));
    const all = Pool.players(run, r),
      got = e.ids.map(id => all.find(p => p.id === id)),
      weak = ps => ps.reduce((a, b) => (ovr(b) < ovr(a) ? b : a)),
      same = got.filter(p => p && p.role === you.role),
      out1 = weak(same.length ? same : got.filter(Boolean));
    e.ids[got.indexOf(out1)] = you.id;
  },
  /**
   * The street crew entrant for a player who is alone (Story): you + hired players of CHALLENGE.hire.ovr, stored as
   * `run.reserve.street` (a reserve team that never includes you) so it saves with the run. Generated on a seeded side
   * stream (RNG.next is restored), so the main random stream is untouched. Built once per run.
   */
  crew(run) {
    const you = Run.you(run);
    let T = run.reserve.street;
    if (!T) {
      const keep = RNG.next;
      RNG.seed(Math.floor(hstr(`crew|${you.id}`) * 4294967296));
      try {
        const used = new Set(
            run.teams.concat(Object.values(run.reserve), run.pickup ? [run.pickup] : []).flatMap(x => squadOf(x).map(p => p.name))
          ),
          H = squadOf(World.pickup(used)),
          drop = H.find(p => p.role === you.role) || H[0];
        T = {
          i: -1,
          name: 'Street crew',
          short: 'STR',
          color: '#8a90b0',
          sk: 'balanced',
          S: STYLES.balanced,
          hist: { w: 0, l: 0, sw: 0, sl: 0, res: [] },
          nStars: 0,
          arch: 'Hired crew',
          region: 'street',
          P: H.filter(p => p !== drop),
          bench: []
        };
        for (const p of T.P) {
          const d = CHALLENGE.hire.ovr - ovr(p);
          for (const k of STATK) p[k] = clamp(p[k] + d, 25, 99);
          p.team = T;
          p.pot = 1;
        }
        finalizeTeam(T);
      } finally {
        RNG.next = keep;
      }
      run.reserve.street = T;
    }
    const left = [you, ...T.P],
      ids = [];
    for (const role of ['S', 'MB', 'WS', 'WS']) {
      const p = left.find(x => x.role === role) || left[0];
      ids.push(p.id);
      left.splice(left.indexOf(p), 1);
    }
    return { name: T.name, short: T.short, color: T.color, region: null, ids: ids.concat(left.map(p => p.id)), academy: false, crew: true };
  },
  /** Story and champion: you are called up to the national team, whatever your grades (spec §4.26). */
  calledUp: run => !!(run.mode && run.mode.story && run.result && run.result.place === 'Champion'),
  /** Entrant i of the running cup as a playable squad (the Academy entrant is your real pickup squad). Lend it before a match. */
  team(run, i) {
    const e = run.cup.entrants[i];
    if (e.academy) return run.pickup;
    return Eval.squad(run, e.ids, e.name, e.color, e.crew ? 'street' : e.region, e.short);
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
    if (run.injury)
      you.noSub = true; // engine-only: the coach never subs an injured you on (restoreLineups clears it)
    else delete you.noSub;
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
      return { T: Eval.squad(run, e.mine, `${club.name} · Eval`, club.color, undefined, club.short), region: FACTIONS[run.team].region };
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
    Run.lineup(run, mine, side.region, false, kind === 'cup' && run.mode.story); // Story: you start every cup match
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
    return {
      a: mine,
      b: opp,
      round: `Street battle: ${REGIONS[c.a].name} vs ${REGIONS[c.b].name} · ${c.name}`,
      back: 'Continue',
      onFinish: m => {
        Eval.restore();
        return Cup.clashResult(run, m, side, foe);
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
  /**
   * A team challenge you take (spec §4.15): your side (Academy squad, your club's squad, or a hired street crew) against club
   * ti's squad, a real match like a street battle. Nothing is spent until it finishes. Null if the club wouldn't accept now.
   */
  challenge(run, ti, stake = 0) {
    const side = City.challengeSide(run),
      W = City.worth(run, ti, stake);
    if (!W || !W.accepts || run.event || City.fightBan(run) || City.noTime(run, City.scoutCost(run, ti)) || run.money < side.cost)
      return null;
    stake = clamp(Math.round(stake) || 0, 0, City.stakeMax(run));
    const opp = run.teams[ti],
      mine = side.kind === 'hired' ? Cup.hired(run) : side.T;
    if (side.kind === 'hired') Eval.lend(run, mine);
    Cup.prepare(run, opp, 'challenge', mine);
    Run.lineup(run, mine, City.myRegion(run));
    Run.lineup(run, opp, null);
    return {
      a: mine,
      b: opp,
      round: `Challenge: ${mine.name} vs ${opp.name}${stake ? ` · stake $${stake}` : ''}`,
      back: 'Continue',
      onFinish: m => {
        Eval.restore();
        return Cup.challengeResult(run, m, ti, stake, side);
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
      trip = (Cup.record(run, m, 'challenge', { stake }), City.go(run, CITY.hq[ti])),
      out = [Growth.matchXp(run, m), Skills.tryLearn(run, m)];
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
      Cup.lose(run, t.name, margin, r, out);
    }
    out.push(Run.bump(run, 'sta', -CLASH.sta));
    Rank.points(run, you.id, RANK.street.fight + (win ? RANK.street.win : 0));
    Rank.meet(run, m);
    run.plays.k += s.k;
    run.plays.blk += s.blk;
    run.plays.ace += s.ace;
    run.focus = null;
    out.push(Cup.injure(run, risk));
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
      trip = (Cup.record(run, m, 'street'), City.go(run, c.at)),
      out = [Growth.matchXp(run, m), Skills.tryLearn(run, m)];
    run.clash.done = true;
    const front = Front.result(run, win ? side : foe, win ? foe : side);
    Rank.points(run, you.id, RANK.street.fight + (win ? RANK.street.win : 0));
    Rank.settle(run, win ? side : foe);
    Rank.meet(run, m);
    out.push(City.repBump(run, side, win ? CLASH.win : CLASH.lose), City.repBump(run, foe, CLASH.other), Run.bump(run, 'sta', -CLASH.sta));
    if (win) out.push(Run.bump(run, 'fans', Math.round(CLASH.fans * gmul)));
    else Cup.lose(run, `${REGIONS[foe].name} crew`, margin, null, out);
    run.plays.k += s.k;
    run.plays.blk += s.blk;
    run.plays.ace += s.ace;
    run.focus = null;
    out.push(Cup.injure(run, risk));
    run.lastFight = Run.dayNo(run);
    const line = `${trip}Fought for ${REGIONS[side].name} in the street battle — ${win ? 'won' : 'lost'} ${sc[0]}-${sc[1]}, grade ${grade}. You: ${s.k} kills, ${s.blk} blocks, ${s.ace} aces · ${out.filter(Boolean).join(', ')}${front ? `. ${front}!` : ''}`;
    Run.log(run, line);
    Run.save(run);
    return line;
  },
  /**
   * Log one of your matches on `run.mlog` (T-052; plain numbers and strings only, newest last, trimmed to MLOG.max): the opponent, score, win,
   * your grade, your stats at kick-off (call this BEFORE Growth.matchXp), your line and the box score of everyone who played.
   * extra: { round, stake } for a cup tie / challenge.
   */
  record(run, m, kind, extra = {}) {
    const you = Run.you(run),
      played = m.played.has(you.id),
      win = m.winner === 0,
      sc = m.setScores[0],
      line = p => {
        const s = m.stat[p.id] || blank();
        return { k: s.k, att: s.att, err: s.err, blk: s.blk, ace: s.ace, dig: s.dig, ast: s.ast };
      },
      box = [];
    [0, 1].forEach(side => {
      for (const p of [...m.lineup0[side].P, ...m.lineup0[side].bench])
        if (m.played.has(p.id))
          box.push({ name: p.name, role: p.role, side, ovr: ovr(p), ...line(p), ...(p.id === you.id ? { you: 1 } : {}) });
    });
    run.mlog.push({
      week: run.week,
      day: Run.dayNo(run),
      kind,
      vs: m.t[1].name,
      short: m.t[1].short || '',
      score: [sc[0], sc[1]],
      win,
      grade: played ? Cup.grade(m.stat[you.id] || blank(), win)[0] : null,
      played,
      ...extra,
      you: { ovr: ovr(you), power: you.power, def: you.def, speed: you.speed, jump: you.jump, wit: you.wit },
      line: line(you),
      box
    });
    if (run.mlog.length > MLOG.max) run.mlog.splice(0, run.mlog.length - MLOG.max);
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
    Cup.record(run, m, kind, kind === 'cup' ? { round: bm.round } : {});
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
      Rank.meet(run, m);
      const sp = Math.round((R0.sp + plays * REWARDS.perPlay.sp) * mul * gmul),
        fans = Math.round((R0.fans + plays * REWARDS.perPlay.fans) * mul * gmul * Sponsors.fanMul(run));
      const out = [
        Growth.matchXp(run, m),
        Skills.tryLearn(run, m),
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
