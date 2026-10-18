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
    const out = [],
      N = Cup.places(run);
    for (const r of Object.keys(POOL)) {
      if (N[r] === 0) continue;
      Pool.draw(run, r, N[r]).forEach((sq, i) =>
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
    Cup.placeRival(run, out);
    return out;
  },
  /**
   * Squads per major in the Cup (spec §4.34): its pool's squads split over its war units by clubs; a destroyed unit's share
   * goes to its destroyer's region (more squads for the attacker), a region with no unit standing sends none. Minors: their
   * pool's (undefined → Pool.draw's default). With no unit destroyed every major sends what its pool holds, as before.
   */
  places(run) {
    const N = {},
      share = {};
    for (const r of MAJORS) {
      const us = War.ofRegion(r),
        n = Math.floor(Pool.size(run, r) / SQUAD),
        clubs = us.reduce((k, u) => k + WAR.units[u].clubs.length, 0);
      for (const u of us) share[u] = (n * WAR.units[u].clubs.length) / clubs;
      N[r] = 0;
    }
    for (const u of War.ids()) N[WAR.units[War.holder(run, u)].region] += share[u];
    for (const r of MAJORS) N[r] = Front.standing(run, r) ? Math.round(N[r]) : 0;
    return N;
  },
  /**
   * Story year 2 (spec §4.28): the rival is in the Cup — not drawn (and not hurt) → she takes the place of the weakest same-role
   * player of her region's first squad without you. Mutates `out`.
   */
  placeRival(run, out) {
    const riv = Stars.get(run, 'rival');
    if (!riv || !Story.on(run) || Season.year(run) < 2 || People.out(run, riv) || out.some(e => e.ids.includes(riv.id))) return;
    const r = (FACTIONS[riv.team.i] && FACTIONS[riv.team.i].region) || riv.team.region || 'wei', // (a walk-out: her new region's reserves)
      e = out.find(x => x.region === r && !x.ids.includes(run.youId));
    if (!e) return;
    const all = Pool.players(run, r),
      ps = e.ids.map(id => all.find(p => p.id === id)).filter(Boolean),
      same = ps.filter(p => p.role === riv.role),
      weak = (same.length ? same : ps).reduce((a, p) => (ovr(p) < ovr(a) ? p : a));
    e.ids[e.ids.indexOf(weak.id)] = riv.id;
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
    const T = Eval.squad(run, e.ids, e.name, e.color, e.crew ? 'street' : e.region, e.short);
    T.wr = e.crew ? null : e.region; // its war stage (War.weakOf)
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
    Cup.splitRival(run, E, me, order);
    run.cup = { id: def.id, entrants: E, me, sched: newBracket(order), done: false };
    Run.log(run, `The ${def.name} begins: ${E.length} squads, seeded by rating. Stamina refilled.`);
    if (me < 0) {
      Run.log(run, `You watch the ${def.name} from the stands.`);
      Cup.close(run, NO_CUP);
    }
  },
  /** Story year 2: the rival's squad goes to the other half of the bracket from yours (you meet in the final if both keep winning). */
  splitRival(run, E, me, order) {
    const riv = Stars.get(run, 'rival');
    if (!riv || !Story.on(run) || Season.year(run) < 2 || me < 0) return;
    const ri = E.findIndex(e => e.ids.includes(riv.id)),
      h = order.length / 2,
      pm = order.indexOf(me),
      pr = order.indexOf(ri);
    if (ri < 0 || ri === me || pm < 0 || pr < 0 || Math.floor(pm / h) !== Math.floor(pr / h)) return;
    const q = (pr + h) % order.length;
    [order[pr], order[q]] = [order[q], order[pr]];
  },
  /** Resolve a fixture at once without watching (its setup, every rally, its finish). Returns the match. */
  simNow(fx) {
    const m = newMatch(fx.a, fx.b, false);
    if (fx.setup) fx.setup(m);
    while (!m.over) playRally(m);
    fx.onFinish(m);
    return m;
  },
  /** Before the cup screen draws: your next match (the other matches before it are simulated) and the run saved. */
  upcoming(run) {
    const m = Cup.next(run);
    Run.save(run);
    return m;
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
    // rivals across the net (T-066): a proud / reckless one comes in fired up, the others rattled (a mood swing, never a stat)
    for (const p of Rel.rivals(run, opp)) {
      const hot = Rel.traits(run, p.id).some(t => t === 'proud' || t === 'reckless'),
        n = p.name.split(' ')[0],
        line = hot ? `${n} wants this one. Fired up to face me.` : `${n} looks rattled across the net.`;
      p.form = +clamp(p.form + (hot ? REL_E.rival.fired : REL_E.rival.rattled), -1, 1).toFixed(2);
      if (!run.log.length || run.log[0].t !== line) Run.log(run, line);
    }
  },
  /** Your side of the next career match: { T: the squad (a temporary one for a drawn squad), region: whose standing counts for your place }. */
  mine(run, kind) {
    if (kind === 'cup') return { T: Cup.team(run, run.cup.me), region: run.cup.entrants[run.cup.me].region };
    const e = Eval.setup(run),
      club = run.team != null ? run.teams[run.team] : null;
    const tag = (T, r) => Object.assign(T, { wu: War.ofClub(run.team), wr: r }); // your club's war stage (War.weakOf)
    if (e && e.kind === 'faction')
      return { T: tag(Eval.squad(run, e.mine, `${club.name} · Eval`, club.color, undefined, club.short), FACTIONS[run.team].region), region: FACTIONS[run.team].region };
    if (e && e.kind === 'rematch' && e.mine)
      return { T: tag(Eval.squad(run, e.mine, club.name, club.color, e.mineRegion, club.short), e.mineRegion), region: e.mineRegion };
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
      if (e.kind === 'faction' || (e.kind === 'rematch' && e.mine)) Eval.lend(run, mine);
      const rt = e.kind === 'rematch' && Stars.get(run, 'rival').team;
      opp = rt
        ? Object.assign(Eval.squad(run, e.opp, rt.name, rt.color, e.region, rt.short), { wu: War.ofClub(rt.i) })
        : Object.assign(Eval.squad(run, e.opp, `${REGIONS[e.region].name} · Eval`, REGIONS[e.region].color), { wr: e.region });
      Eval.lend(run, opp);
      round = rt
        ? `The rematch (year 2, week ${run.week})`
        : `${e.kind === 'academy' ? 'Academy' : REGIONS[e.region].name} evaluation (week ${run.week})`;
    } else if (kind === 'cup') {
      opp = Cup.team(run, bm.a === run.cup.me ? bm.b : bm.a);
      Eval.lend(run, mine);
      Eval.lend(run, opp);
      round = `${def.name} ${bm.round}`;
    }
    Cup.prepare(run, opp, kind, mine);
    const lu = Run.lineup(run, mine, side.region, false, (kind === 'cup' || Season.rematch(run)) && run.mode.story); // Story: you start every cup match and the rematch
    if (lu.starts && lu.rival) Rel.spot(run, lu.rival.p.id); // you took a same-role mate's spot
    const rel = Rel.matchFlags(run, mine, opp);
    return {
      a: mine,
      b: opp,
      round,
      back: 'Continue',
      rel,
      // relationship flags for the engine (T-066); "Feed me": a captain's buff on you for the first 8 points
      setup: m => {
        m.rel = rel;
        War.match(run, m); // the war's stages: morale, HP heal, card slots (spec §4.34)
        Feel.match(run, m); // Fired up: a whole-match buff on you (spec §4.30)
        if (kind === 'cup' && you.cap && run.talk === 'feed') {
          m.buff[you.id] = { lv: 2, n: 8 };
          elBuff(m, you); // an unlocked element: the gauge starts full
        }
      },
      onFinish: m => {
        Eval.restore();
        return Cup.result(run, m, kind, bm);
      },
      onLeave: () => Eval.restore() // the UI then returns to the hub (watchCareer)
    };
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
      y: Season.year(run),
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
    Feel.result(run, m, played, run.mlog[run.mlog.length - 1].grade); // Drive & Pain (spec §4.30): every match of yours
    Story.matched(run, kind, win, played); // the hub's next scene may be about this match (T-175)
  },
  /**
   * Story flags from a match against the rival's side (spec §4.28): `rematchWon` / `rematchLost` (year-2 rematch); `beatRival` — you
   * beat her squad in the year-1 Cup (her year-2 curve goes to its maximum; the Cup won sets it too, Cup.close).
   */
  rivalMet(run, m, kind, bm) {
    if (!Story.on(run)) return;
    const riv = Stars.get(run, 'rival'),
      F = run.story.flags,
      win = m.winner === 0;
    if (!riv || !squadOf(m.t[1]).includes(riv)) return;
    if (Season.rematch(run)) F[win ? 'rematchWon' : 'rematchLost'] = true;
    if (kind === 'cup' && win && Season.year(run) === 1) F.beatRival = true;
    if (kind === 'cup' && Season.year(run) > 1) F[win ? 'cupBeatRival' : 'cupLostRival'] = true;
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
    Cup.record(run, m, kind, kind === 'cup' ? { round: bm.round } : Season.rematch(run) ? { round: 'Rematch' } : {});
    Cup.rivalMet(run, m, kind, bm);
    Rel.afterMatch(run, m, 0);
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
        R0 = kind === 'cup' ? (win ? REWARDS.cupWin : { sp: 0, fans: 0 }) : win ? REWARDS.evalWin : REWARDS.evalLoss;
      grade = g;
      Rank.meet(run, m);
      const sp = Math.round((R0.sp + plays * REWARDS.perPlay.sp) * mul * gmul),
        fans = Math.round((R0.fans + plays * REWARDS.perPlay.fans) * mul * gmul * Sponsors.fanMul(run));
      const out = [
        Growth.matchXp(run, m),
        Skills.tryLearn(run, m),
        Run.bump(run, 'sp', sp),
        Run.bump(run, 'fans', fans),
        World.prize(run, Math.round((kind === 'cup' ? (win ? ECON.cupWin : 0) : win ? ECON.evalWin : ECON.evalLoss) * mul))
      ];
      if (grade === 'S') out.push(Run.bump(run, 'mood', 1));
      const fm = Cup.focusMet(run, s);
      if (fm) out.push('focus met', Run.bump(run, 'sp', FOCUS_REWARD.sp), Run.bump(run, 'fans', FOCUS_REWARD.fans));
      else if (fm === false) out.push('focus missed');
      run.plays.k += s.k;
      run.plays.blk += s.blk;
      run.plays.ace += s.ace;
      run.grades.push(grade);
      if (run.grades.length > MLOG.max) run.grades.splice(0, run.grades.length - MLOG.max);
      run.focus = null;
      out.push(ElTrial.match(run, m, grade));
      Sponsors.match(run, win, grade);
      line = `${win ? 'Won' : 'Lost'} ${score} vs ${opp.name} · grade ${grade}${part ? ' (bench: rewards ×' + BENCH.partMul + ')' : ''}. You: ${s.k} kills, ${s.blk} blocks, ${s.ace} aces · ${out.filter(Boolean).join(', ')}`;
    }
    Run.log(run, line);
    if (kind === 'eval') {
      run.evals.push({ week: run.week, y: Season.year(run), vs: opp.i, win: played && win, score, grade });
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
    if (Season.last(run))
      People.national(run); // year 1 of Story: nobody is called up yet (spec §4.28)
    else if (place === 'Champion' && Story.on(run)) run.story.flags.beatRival = true; // the year-1 Cup won: she takes it personally
    run.cups.push({ id: def.id, place, champ, y: Season.year(run) });
    Run.log(
      run,
      place === NO_CUP
        ? `The ${def.name} is over — won by ${champ}.`
        : `${place === 'Champion' ? `${run.cup.entrants[run.cup.me].name} win the ${def.name}!` : `Out of the ${def.name} in the ${place.toLowerCase()}.`} ${out.filter(Boolean).join(', ')}`
    );
    if (Season.last(run)) Cup.end(run, place);
    else Season.rollover(run); // Story year 1: the run goes on to year 2
  },
  /** End the run: rank and result. place = your U21 Final Cup finish. */
  end(run, place) {
    const rank = rankOf(run.fans, Season.year(run));
    Run.snap(run);
    run.result = { place, rank, cups: run.cups, champ: run.cups[run.cups.length - 1].champ };
    if (Story.on(run) && Season.year(run) > 1) run.result.ending = place === 'Champion' ? 'true' : 'spite'; // spec §4.28
    Run.save(run);
  }
};
