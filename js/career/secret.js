// The secret places (spec §4.31): SPOTS with `secret` stay off the map until someone tells you — Fern's goodbye (the Tape
// Room, the Lighthouse, the Hermit's Court, her Rooftop, the Onsen), a street contact (the Midnight Court), your fame (the Old
// Scout). Each does one thing no other place does. City.day hands their acts here. DOM-free; the main random stream is never
// touched — the night games and the scout's rating run on a seeded stream (Secret.isolated).

const Secret = {
  /** The SPOTS acts this module runs. */
  acts: ['tapes', 'light', 'hermit', 'roof', 'onsen', 'midnight', 'oldScout'],
  /** This run's secret-place state ({ midnight, trials, letterW, scoutW, told: { id: true } }). */
  of(run) {
    if (!run.secret || typeof run.secret !== 'object') run.secret = {};
    return run.secret;
  },
  /** Is place id on your map? Not a secret → always; else told by Fern, a street contact, or your fans. */
  known(run, id) {
    const s = SPOTS[id];
    if (!s || !s.secret) return true;
    if (id === 'midnight') return !!Secret.of(run).midnight;
    if (id === 'oldScout') return run.fans >= SECRET.oldScout.fans;
    return !!(run.story && run.story.flags.secrets);
  },
  /** A street contact tells you about the Midnight Court (a street win: battle or hustle). */
  street(run) {
    const S = Secret.of(run);
    if (S.midnight) return;
    S.midnight = true;
    Run.log(run, SECRET_LINES.midnightTold, 'good');
  },
  /** Week end: the Old Scout hears of you once your fans pass his mark (a diary line, once). */
  week(run) {
    const S = Secret.of(run);
    if (!S.scoutTold && Secret.known(run, 'oldScout')) {
      S.scoutTold = true;
      Run.log(run, SECRET_LINES.scoutTold, 'good');
    }
  },
  /** Why place id can't be used now beyond City.can's checks ('' if it can); opt: the Lighthouse's choice. */
  why(run, id, opt) {
    const S = Secret.of(run);
    if (!Secret.known(run, id)) return 'unknown place';
    if (id === 'light' && !['let', 'sharp'].includes(opt)) return 'choose';
    if (id === 'roof' && !Secret.letter(run)) return 'no letter yet';
    if (id === 'oldScout') {
      const wait = SECRET.oldScout.every - (Season.wk(run) - (S.scoutW == null ? -99 : S.scoutW));
      if (wait > 0) return `he rates you again in ${wait} week${wait > 1 ? 's' : ''}`;
      if (!Stars.get(run, 'rival')) return 'nobody left to rate you against';
    }
    if (id === 'midnight' && !['train', 'camp'].includes(Run.weekType(run))) return 'not in a match week';
    return '';
  },
  /** Fern's letter waiting on the roof (year 2, one every SECRET.roof.every weeks): its key, or null. */
  letter(run) {
    const S = Secret.of(run);
    if (Season.year(run) < 2 || !Secret.known(run, 'roof')) return null;
    if (Season.wk(run) - (S.letterW == null ? -99 : S.letterW) < SECRET.roof.every) return null;
    const you = Run.you(run),
      F = Feel.of(run),
      low = STATK.reduce((a, k) => (you[k] < you[a] ? k : a), STATK[0]);
    if (!(run.habits || []).length) return 'habits';
    if (F.pain >= 60) return 'pain';
    if (F.drive <= 20) return 'drive';
    if (you[low] < 55) return 'stat';
    return 'fine';
  },
  /** What the tapes show about the rival, one fact per key (true numbers from the engine), in the order you uncover them. */
  habits(run) {
    const riv = Stars.get(run, 'rival');
    if (!riv) return [];
    const line = Math.round(100 * habitLine(riv)),
      st = serveType(riv, 60);
    return [
      { k: 'lane', text: `Her spikes: down the line ${line} %, cross-court ${100 - line} %.` },
      { k: 'serve', text: `Her serve: ${st === 'jump' ? 'a jump serve' : st === 'jumpfloat' ? 'a jump float' : 'a float'}.` },
      { k: 'team', text: `${riv.team.name}: ${Dossier.habitText(Dossier.habits(riv.team))}.` },
      { k: 'move', text: `Her finisher: ${riv.move}.` }
    ];
  },
  /** The rival facts you have uncovered (texts). */
  seen: run => Secret.habits(run).filter(h => (run.habits || []).includes(h.k)),
  /** Run fn on a seeded stream (the night games, the scout's sims): the run's own random stream is left where it was. */
  isolated(seed, fn) {
    const next = RNG.next;
    RNG.seed(seed);
    try {
      return fn();
    } finally {
      RNG.next = next;
    }
  },
  /** A day at a secret place (after City.can): returns the diary line. opt: the Lighthouse's 'let' | 'sharp'. */
  day(run, id, opt) {
    if (Secret.why(run, id, opt)) return '';
    const S = Secret.of(run),
      s = SPOTS[id],
      cost = City.price(run, id),
      trip = City.arrive(run, id),
      you = Run.you(run),
      out = [];
    if (cost) {
      run.money -= cost;
      out.push(`−$${cost}`);
    }
    if (id === 'tapes') {
      const H = run.habits || (run.habits = []),
        next = Secret.habits(run).find(h => !H.includes(h.k));
      if (!S.taped) {
        S.taped = true;
        out.push(SECRET_LINES.tapeFirst);
        Feel.add(run, 'pain', SECRET.tapes.pain);
      } else if (next) {
        H.push(next.k);
        out.push(next.text);
      } else out.push(SECRET_LINES.tapeDone);
    } else if (id === 'light') {
      const F = Feel.of(run);
      if (opt === 'let') {
        F.pain = Math.max(0, F.pain - SECRET.light.let);
        out.push(SECRET_LINES.lightLet);
      } else {
        S.sharp = (S.sharp || 0) + 1; // the next Scar's OP odds (T-291)
        out.push(SECRET_LINES.lightSharp);
        Feel.add(run, 'pain', SECRET.light.sharp);
      }
    } else if (id === 'hermit') {
      const n = S.trials || 0,
        bar = SECRET.hermit.bars[n],
        best = STATK.reduce((a, k) => (you[k] > you[a] ? k : a), STATK[0]);
      if (bar == null) out.push(SECRET_LINES.hermitDone);
      else if (you[best] < bar) out.push(SECRET_LINES.hermitNo.replace('{stat}', STATNAME[best]).replace('{bar}', bar));
      else {
        const move = SECRET_LINES.moves[n];
        S.trials = n + 1;
        (run.secretMoves || (run.secretMoves = [])).push(move);
        you[best] = Math.min(99, you[best] + SECRET.hermit.gain); // a trial pays past the training cap
        out.push(SECRET_LINES.hermitYes.replace('{move}', move), `+${SECRET.hermit.gain} ${STATNAME[best]}`);
        Feel.add(run, 'drive', FEEL.drive.win);
      }
    } else if (id === 'roof') {
      const k = Secret.letter(run),
        low = STATK.reduce((a, q) => (you[q] < you[a] ? q : a), STATK[0]);
      S.letterW = Season.wk(run);
      out.push(SECRET_LINES.letters[k].replace('{stat}', STATNAME[low].toLowerCase()), Run.bump(run, 'mood', 1));
    } else if (id === 'onsen') {
      City.spend(run, (s.days || 1) - 1);
      City.logDays(run, 0, { k: 'rest', label: 'Onsen', at: s.name });
      run.sta = run.staMax;
      out.push(`stamina full`, Run.bump(run, 'mood', MOODS.length));
      if (run.injury) {
        run.injury.weeks = Math.max(0, run.injury.weeks - 1);
        out.push('the injury eases');
        if (!run.injury.weeks) run.injury = null;
      }
    } else if (id === 'midnight') out.push(Secret.midnight(run));
    else if (id === 'oldScout') out.push(Secret.rate(run));
    return `${trip}${s.name}: ${out.filter(Boolean).join(' · ')}`;
  },
  /**
   * A night game under the overpass: your squad against league players near your level — and now and then one of the named
   * (seeded by the week). Played at once, off the record but on your history; a win brings Drive, a loss Pain.
   */
  midnight(run) {
    const mine = Run.myTeam(run),
      wk = Season.wk(run),
      named = Stars.all(run).filter(p => p.named !== 'ace' && !squadOf(mine).includes(p)),
      who = hstr(`midnight|${run.pseed}|${wk}`) < 0.5 && named.length ? named[Math.floor(hstr(`midwho|${wk}`) * named.length)] : null;
    const m = Secret.isolated(hstr(`midseed|${run.pseed}|${wk}`) * 4294967296, () => {
      const { T } = Court.draw(run, 'arena', 'pro', mine);
      if (who) {
        const i = T.P.findIndex(p => p.role === who.role);
        T.P[i < 0 ? 3 : i] = who;
        [T.s, T.mb] = T.P;
        T.ws = [T.P[2], T.P[3]];
      }
      T.name = 'Night crew';
      T.short = 'NGT';
      Eval.lend(run, T);
      try {
        return simMatch(mine, T);
      } finally {
        Eval.restore();
      }
    });
    Cup.record(run, m, 'court', { round: 'Midnight Court' });
    Rank.meet(run, m);
    const win = m.winner === 0,
      sc = m.setScores[0];
    Feel.add(run, win ? 'drive' : 'pain', win ? SECRET.midnight.win : SECRET.midnight.loss);
    return `${win ? 'won' : 'lost'} ${sc[0]}-${sc[1]}${who ? ` — ${who.name} was across the net` : ''}`;
  },
  /** The Old Scout's honest number: your squad against the rival's, SECRET.oldScout.n games on a seeded stream → "x in n". */
  rate(run) {
    const S = Secret.of(run),
      riv = Stars.get(run, 'rival'),
      mine = Run.myTeam(run),
      n = SECRET.oldScout.n;
    S.scoutW = Season.wk(run);
    if (squadOf(mine).includes(riv)) return `"She's on your side of the net. Ask me again when she isn't."`;
    const w = Secret.isolated(hstr(`scout|${run.pseed}|${Season.wk(run)}`) * 4294967296, () => {
      let k = 0;
      for (let i = 0; i < n; i++) if (simMatch(mine, riv.team).winner === 0) k++;
      return k;
    });
    return `"${mine.name} against ${riv.team.name}, today: ${w} in ${n}. Don't thank me. Change it."`;
  }
};
