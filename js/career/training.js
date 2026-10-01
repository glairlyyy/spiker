// Weekly choices: the five trainings (normal or Hard), Rest and Recreation. Gains scale with mood, facility level
// (Lv 1–5), a streak of the same training, teammates training alongside you (friendship at bond 80+), the camps and
// sponsor perks. Training (and events) stop a stat at TRAIN_CAP; only matches go higher. Training while exhausted can
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
  /** Gain multiplier for a training right now (x: the place — its quality × home turf, see City.mul). */
  mul(run, key, hard, x = 1) {
    const you = Run.you(run);
    let mates = 0;
    for (const id of run.floor[key] || []) mates += (you.bond[id] || 0) >= 80 ? 0.5 : 0.2;
    return (
      MOODS[run.mood].mul *
      (1 + 0.1 * Training.facility(run, key)) *
      (1 + mates) *
      (1 + Training.streakBonus(run, key)) *
      (1 + Sponsors.trainBonus(run, key)) *
      x *
      (Training.camp(run) ? 1.5 : 1) *
      (hard ? TRAIN_X.hard.gain : 1) *
      (run.injury ? 0.4 : 1)
    );
  },
  staCost: (run, key, hard) =>
    Math.round(TRAININGS[key].sta * (Training.camp(run) ? 1.5 : 1) * (hard ? TRAIN_X.hard.sta : 1) * (run.injury ? 0.5 : 1)),
  /** Failure chance: below 50 stamina, (50 − stamina) × 1.5%; Hard adds 15%. */
  failP: (run, hard) => clamp((50 - run.sta) * 0.015 + (hard ? TRAIN_X.hard.fail : 0), 0, 0.95),
  /** Diminishing returns: ×0.9 from 60, ×0.7 from 70, ×0.45 from 80, ×0.3 from 85, ×0.15 from 92. */
  dim: v => (v >= 92 ? 0.15 : v >= 85 ? 0.3 : v >= 80 ? 0.45 : v >= 70 ? 0.7 : v >= 60 ? 0.9 : 1),
  /** XP needed for the next point of a stat at level v. */
  need: v => Math.max(1, Math.round(TRAIN_X.xp.base * Math.pow(TRAIN_X.xp.grow, v - TRAIN_X.xp.from))),
  /** A stat's level (wit in 0.02 steps). */
  level: (you, stat) => (stat === 'wit' ? Math.round(you.wit * 50) : you[stat]),
  /** Where a stat stops for a source of XP: 'train' (sessions, default) → TRAIN_CAP; 'match' → the run cap. Wit: its own cap. */
  top: (run, stat, src = 'train') => (stat === 'wit' ? Math.round(CAREER.witRunCap * 50) : src === 'match' ? CAREER.runCap : TRAIN_CAP),
  /** XP a session gives a stat: its base gain (wit converted to 0.02 steps) × per × the multiplier. */
  xpFor: (stat, base, mul) => Math.round((stat === 'wit' ? base * 50 : base) * TRAIN_X.xp.per * mul),
  /** Adding xp to a stat: { pts, have } — points gained and the XP left toward the next one (none past the top). */
  sim(run, stat, xp, src = 'train') {
    const top = Training.top(run, stat, src);
    let v = Training.level(Run.you(run), stat),
      have = ((run.xp && run.xp[stat]) || 0) + xp,
      pts = 0;
    if (v >= top) return { pts: 0, have: (run.xp && run.xp[stat]) || 0 }; // already at (or above) this source's top: it banks nothing
    while (v < top && have >= Training.need(v)) {
      have -= Training.need(v);
      v++;
      pts++;
    }
    if (v >= top) have = 0; // reached the top: nothing banks past it
    return { pts, have };
  },
  /** Expected points for one stat from a session (wit as a decimal gain). */
  gain(run, stat, base, mul, src = 'train') {
    const { pts } = Training.sim(run, stat, Training.xpFor(stat, base, mul), src);
    return stat === 'wit' ? +(pts * 0.02).toFixed(2) : pts;
  },
  /** Give a stat XP: raises it by the points earned, banks the rest. Returns a short label for the log. */
  addXp(run, stat, xp, src = 'train') {
    const you = Run.you(run),
      r = Training.sim(run, stat, xp, src);
    (run.xp || (run.xp = {}))[stat] = r.have;
    if (stat === 'wit') you.wit = +(you.wit + r.pts * 0.02).toFixed(2);
    else you[stat] += r.pts;
    return r.pts ? `+${stat === 'wit' ? (r.pts * 0.02).toFixed(2) : r.pts} ${STATNAME[stat]}` : `${STATNAME[stat]} progress`;
  },
  /** XP toward the next point: { have, need } (for the stat bars). */
  progress: (run, stat) => ({ have: (run.xp && run.xp[stat]) || 0, need: Training.need(Training.level(Run.you(run), stat)) }),
  preview(run, key, hard, x = 1) {
    const T = TRAININGS[key],
      mul = Training.mul(run, key, hard, x);
    return {
      main: [T.main[0], Training.gain(run, T.main[0], T.main[1], mul), Training.xpFor(T.main[0], T.main[1], mul)],
      side: [T.side[0], Training.gain(run, T.side[0], T.side[1], mul), Training.xpFor(T.side[0], T.side[1], mul)],
      sta: Training.staCost(run, key, hard),
      fail: Training.failP(run, hard),
      lvl: Training.facility(run, key) + 1,
      next: Training.toNext(run, key),
      streak: Training.streakBonus(run, key),
      cap: STATK.includes(T.main[0]) && Run.you(run)[T.main[0]] >= TRAIN_CAP ? TRAIN_CAP : null,
      mates: run.floor[key] || []
    };
  },
  /** Train (hard = the Hard option; not while injured; x = the place's multiplier; spMul = skill points ×). Returns a summary line for the log. */
  train(run, key, hard, x = 1, spMul = 1) {
    hard = hard && !run.injury;
    const pv = Training.preview(run, key, hard, x),
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
    out.push(Training.addXp(run, pv.main[0], pv.main[2]), Training.addXp(run, pv.side[0], pv.side[2]));
    out.push(Run.bump(run, 'sta', -pv.sta), Run.bump(run, 'sp', Math.round(CAREER.spPerTraining * (hard ? 1.5 : 1) * spMul)));
    for (const id of pv.mates) {
      out.push(Run.bond(run, id, 7));
      Growth.shared(run, id, pv);
    }
    const lv0 = Training.facility(run, key);
    run.uses[key] = (run.uses[key] || 0) + 1;
    if (Training.facility(run, key) > lv0) out.push(`${TRAININGS[key].name} facility Lv ${Training.facility(run, key) + 1}`);
    return `${name}${Training.camp(run) ? ' (camp)' : ''}: ${out.filter(Boolean).join(', ')}`;
  },
  /** Rest: stamina × how well you sleep (your home — or `mul`, e.g. a hotel away from home). */
  rest(run, mul = null) {
    const out = [Run.bump(run, 'sta', Math.round(rnd(30, 60) * (mul == null ? World.restMul(run) : mul)))];
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
