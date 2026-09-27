// Weekly choices: the five trainings (normal or Hard), Rest and Recreation. Gains scale with mood, facility level
// (Lv 1–5), a streak of the same training, teammates training alongside you (friendship at bond 80+), the camps and
// sponsor perks. Each stat stops at 80 and 90 until its Limit Break trial is passed. Training while exhausted can
// injure you (light training only until it heals).

const Training = {
  /** Facility level index 0–4 (shown as Lv 1–5) from how often you have done this training. */
  facility(run, key) {
    const u = run.uses[key] || 0;
    let lv = 0;
    while (lv + 1 < TRAIN_X.lvUses.length && u >= TRAIN_X.lvUses[lv + 1]) lv++;
    return lv;
  },
  camp: run => Run.weekType(run) === 'camp',
  /** Sessions until the next facility level (null at Lv 5). */
  toNext(run, key) {
    const lv = Training.facility(run, key),
      need = TRAIN_X.lvUses[lv + 1];
    return need == null ? null : need - (run.uses[key] || 0);
  },
  /** Where this stat stops until its next Limit Break (99 once both are passed). */
  gate(run, stat) {
    if (!STATK.includes(stat)) return CAREER.runCap;
    const n = (run.lb && run.lb[stat]) || 0;
    return n < TRAIN_X.gates.length ? TRAIN_X.gates[n] : CAREER.runCap;
  },
  /** Same training in consecutive weeks: +5% a week, up to +20%. */
  streakBonus(run, key) {
    const s = run.streak;
    return s && s.key === key ? Math.min(TRAIN_X.streak.max, s.n * TRAIN_X.streak.step) : 0;
  },
  /** Teammates at each training this week: each shows up somewhere with a fixed chance. */
  rollFloor(run) {
    run.floor = {};
    for (const m of Run.mates(run))
      if (R() < CAREER.floorChance) {
        const k = pick(TRAINK);
        (run.floor[k] = run.floor[k] || []).push(m.id);
      }
  },
  /** Gain multiplier for a training right now. */
  mul(run, key, hard) {
    const you = Run.you(run);
    let mates = 0;
    for (const id of run.floor[key] || []) mates += (you.bond[id] || 0) >= 80 ? 0.5 : 0.2;
    return (
      MOODS[run.mood].mul *
      (1 + 0.1 * Training.facility(run, key)) *
      (1 + mates) *
      (1 + Training.streakBonus(run, key)) *
      (1 + Sponsors.trainBonus(run, key)) *
      (Training.camp(run) ? 1.5 : 1) *
      (hard ? TRAIN_X.hard.gain : 1) *
      (run.injury ? 0.4 : 1)
    );
  },
  staCost: (run, key, hard) => Math.round(TRAININGS[key].sta * (Training.camp(run) ? 1.5 : 1) * (hard ? TRAIN_X.hard.sta : 1) * (run.injury ? 0.5 : 1)),
  /** Failure chance: below 50 stamina, (50 − stamina) × 1.5%; Hard adds 15%. */
  failP: (run, hard) => clamp((50 - run.sta) * 0.015 + (hard ? TRAIN_X.hard.fail : 0), 0, 0.95),
  /** Diminishing returns: ×0.9 from 60, ×0.7 from 70, ×0.45 from 80, ×0.3 from 85, ×0.15 from 92. */
  dim: v => (v >= 92 ? 0.15 : v >= 85 ? 0.3 : v >= 80 ? 0.45 : v >= 70 ? 0.7 : v >= 60 ? 0.9 : 1),
  /** Expected gain for one stat (diminishing near the top, stopped at the limit-break gate and the run cap). */
  gain(run, stat, base, mul) {
    const you = Run.you(run);
    if (stat === 'wit') return +Math.min(base * mul * (you.wit >= 1.6 ? 0.5 : 1), CAREER.witRunCap - you.wit).toFixed(2);
    return Math.max(0, Math.min(Math.round(base * mul * Training.dim(you[stat])), Training.gate(run, stat) - you[stat]));
  },
  preview(run, key, hard) {
    const T = TRAININGS[key],
      mul = Training.mul(run, key, hard);
    return {
      main: [T.main[0], Training.gain(run, T.main[0], T.main[1], mul)],
      side: [T.side[0], Training.gain(run, T.side[0], T.side[1], mul)],
      sta: Training.staCost(run, key, hard),
      fail: Training.failP(run, hard),
      lvl: Training.facility(run, key) + 1,
      next: Training.toNext(run, key),
      streak: Training.streakBonus(run, key),
      gate: STATK.includes(T.main[0]) && Run.you(run)[T.main[0]] >= Training.gate(run, T.main[0]) ? Training.gate(run, T.main[0]) : null,
      mates: run.floor[key] || []
    };
  },
  /** Train (hard = the Hard option; not while injured). Returns a summary line for the log. */
  train(run, key, hard) {
    hard = hard && !run.injury;
    const pv = Training.preview(run, key, hard),
      out = [],
      name = `${hard ? 'Hard ' : ''}${TRAININGS[key].name}${run.injury ? ' (light)' : ''} training`;
    run.lastMain = pv.main[0];
    run.trained = 1;
    run.streak = run.streak && run.streak.key === key ? { key, n: run.streak.n + 1 } : { key, n: 1 };
    if (R() < pv.fail) {
      run.streak = null;
      out.push(Run.bump(run, 'sta', -pv.sta));
      // exhausted: a failed session can injure you
      if (run.sta < TRAIN_X.injuryAt && !run.injury && R() < 0.5) {
        run.injury = { weeks: R() < 0.5 ? 1 : 2 };
        out.push(Run.bump(run, 'mood', -1));
        return `${name} failed — injured! Light training only for ${run.injury.weeks} week${run.injury.weeks > 1 ? 's' : ''}: ${out.filter(Boolean).join(', ')}`;
      }
      out.push(Run.bump(run, pv.main[0], pv.main[0] === 'wit' ? -0.03 : -3), Run.bump(run, 'mood', -1));
      return `${name} failed: ${out.filter(Boolean).join(', ')}`;
    }
    out.push(Run.bump(run, pv.main[0], pv.main[1]), Run.bump(run, pv.side[0], pv.side[1]));
    out.push(Run.bump(run, 'sta', -pv.sta), Run.bump(run, 'sp', Math.round(CAREER.spPerTraining * (hard ? 1.5 : 1))));
    for (const id of pv.mates) {
      out.push(Run.bond(run, id, 7));
      Growth.shared(run, id, pv);
    }
    const lv0 = Training.facility(run, key);
    run.uses[key] = (run.uses[key] || 0) + 1;
    if (Training.facility(run, key) > lv0) out.push(`${TRAININGS[key].name} facility Lv ${Training.facility(run, key) + 1}`);
    // reached a limit-break gate: the trial is offered right away
    const st = pv.main[0];
    if (STATK.includes(st) && Run.you(run)[st] >= Training.gate(run, st) && Training.gate(run, st) < CAREER.runCap)
      run.event = { id: 'limit', stat: st };
    return `${name}${Training.camp(run) ? ' (camp)' : ''}: ${out.filter(Boolean).join(', ')}`;
  },
  /** Limit Break trial: the chance grows with mood and stamina. Pass → the gate opens (+3 to the stat). */
  trialP: run => clamp(0.35 + 0.08 * (run.mood - 2) + run.sta / 300, 0.15, 0.9),
  trial(run, stat) {
    if (R() < Training.trialP(run)) {
      run.lb[stat] = (run.lb[stat] || 0) + 1;
      const you = Run.you(run),
        v0 = you[stat];
      you[stat] = Math.min(Training.gate(run, stat), v0 + 3); // a flat +3: the breakthrough ignores diminishing returns
      const out = [`+${you[stat] - v0} ${STATNAME[stat]}`, Run.bump(run, 'mood', 1)];
      return `Limit Break: ${STATNAME[stat]} can now reach ${Training.gate(run, stat)}! ${out.filter(Boolean).join(', ')}`;
    }
    const out = [Run.bump(run, 'sta', -15), Run.bump(run, 'mood', -1)];
    return `Limit Break trial failed — ${STATNAME[stat]} stays capped at ${Training.gate(run, stat)} for now: ${out.filter(Boolean).join(', ')}`;
  },
  rest(run) {
    const out = [Run.bump(run, 'sta', Math.round(rnd(30, 60)))];
    if (run.injury && R() < 0.5) {
      run.injury.weeks = Math.max(0, run.injury.weeks - 1);
      out.push('injury healing faster');
    }
    if (R() < 0.1) out.push(Run.bump(run, 'mood', -1));
    return `Rest: ${out.filter(Boolean).join(', ') || 'nothing changed'}`;
  },
  recreation(run) {
    const out = [Run.bump(run, 'mood', 1), Run.bump(run, 'sta', 10)];
    return `Recreation: ${out.filter(Boolean).join(', ') || 'already at your best'}`;
  },
  /** See the physio: spend skill points to heal an injury at once. */
  physio(run) {
    if (!run.injury || run.sp < TRAIN_X.physio) return false;
    run.sp -= TRAIN_X.physio;
    run.injury = null;
    Run.log(run, `Physio session: injury healed (−${TRAIN_X.physio} skill pts).`);
    Run.save(run);
    return true;
  }
};
