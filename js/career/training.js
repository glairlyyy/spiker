// Weekly choices: the day orders at a place's kit (Drill / Work / Stretch, spec §4.33; Training.order) and the old five
// trainings (Training.train: tests, the harness), normal or Hard, Rest and Recreation. Gains scale with mood, facility level
// (Lv 1–5), a streak of the same training, teammates training alongside you (friendship at bond 80+), the camps and
// sponsor perks. Training (and events) stop a stat at Training.cap (TRAIN_CAP; year 2 SEASON.cap); only matches go higher. Training while exhausted can
// injure you (light training only until it heals).

const Training = {
  /** While a match result is being counted ({} from resultSnap to resultData): XP given per stat. Display only, never saved. */
  tally: null,
  /** Facility level index 0–4 for `u` uses. */
  lvOf(u) {
    let lv = 0;
    while (lv + 1 < TRAIN_X.lvUses.length && u >= TRAIN_X.lvUses[lv + 1]) lv++;
    return lv;
  },
  /** A fixed facility level (the Academy Gym), else null. */
  fixed: k => (SPOTS[k] && SPOTS[k].lv) || (TRAININGS[k] && TRAININGS[k].lv) || null,
  /**
   * Facility level index 0–4 (shown as Lv 1–5). A place id (spec §4.33): how often you have worked out there (run.uses by place;
   * not a kit place: 0). A training key: its own uses or its best place's (the places it leads), whichever is higher.
   */
  facility(run, key) {
    const fx = Training.fixed(key),
      u = run.uses || {};
    if (fx) return fx - 1;
    if (SPOTS[key]) return SPOTS[key].kit ? Training.lvOf(u[key] || 0) : 0;
    if (!TRAININGS[key]) return 0;
    return Math.max(Training.lvOf(u[key] || 0), ...City.spotsFor(key).map(id => (Training.fixed(id) ? 0 : Training.lvOf(u[id] || 0))));
  },
  camp: run => Run.weekType(run) === 'camp',
  /** 2 h sessions until the next facility level (null at Lv 5 or fixed). */
  toNext(run, key) {
    if (Training.fixed(key) || (SPOTS[key] && !SPOTS[key].kit)) return null;
    const lv = Training.facility(run, key),
      need = TRAIN_X.lvUses[lv + 1];
    return need == null ? null : Math.max(1, Math.ceil((need - (run.uses[key] || 0)) / Training.units(2) - 1e-9));
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
  /** The session's definition: a day order (DAY_ORDERS) or a training (TRAININGS). */
  def: key => DAY_ORDERS[key] || TRAININGS[key],
  /** Teammates on the floor for `key` at place `at` (an order: the place's lead training; nowhere: none). */
  matesAt(run, key, at) {
    const k = at ? SPOTS[at] && SPOTS[at].train : TRAININGS[key] ? key : null;
    return (k && run.floor[k]) || [];
  },
  /** Gain multiplier for a training / day order right now (x: the place — its quality × home turf, see City.mul; at: the place id). */
  mul(run, key, hard, x = 1, at = null) {
    const you = Run.you(run),
      T = Training.def(key);
    let mates = 0;
    for (const id of Training.matesAt(run, key, at)) mates += (you.bond[id] || 0) >= 80 ? 0.5 : 0.2;
    return (
      MOODS[run.mood].mul *
      (1 + 0.1 * Training.facility(run, at || key)) *
      (1 + mates) *
      (1 + Training.streakBonus(run, key)) *
      (1 + Sponsors.trainBonus(run, T.train || key)) *
      x *
      (Training.camp(run) ? 1.5 : 1) *
      (hard ? TRAIN_X.hard.gain : 1) *
      (run.injury ? 0.4 : 1) *
      Feel.trainMul(run) // Fired up (spec §4.30)
    );
  },
  /** A session of h hours in old day sessions (spec §4.41): HOURS.unit for 2 h, linear in the hours. */
  units: h => (HOURS.unit * (h || 2)) / 2,
  /** Stamina a session costs; h (hours, §4.41): × HOURS.sta[h] × HOURS.staK — each hour costs more than the last (no h: the old day session). */
  staCost: (run, key, hard, h) =>
    Math.round(
      Training.def(key).sta *
        (h ? HOURS.sta[h] * HOURS.staK : 1) *
        (Training.camp(run) ? 1.5 : 1) *
        (hard ? TRAIN_X.hard.sta : 1) *
        (run.injury ? 0.5 : 1)
    ),
  /** Failure chance: below 50 stamina, (50 − stamina) × 1.5%; Hard adds 15%; a long session (h hours) HOURS.fail[h]. */
  failP: (run, hard, h) =>
    clamp(clamp((50 - run.sta) * 0.015 + (hard ? TRAIN_X.hard.fail : 0), 0, 0.95) + ((h && HOURS.fail[h]) || 0), 0, 0.95),
  /** Diminishing returns: ×0.9 from 60, ×0.7 from 70, ×0.45 from 80, ×0.3 from 85, ×0.15 from 92. */
  dim: v => (v >= 92 ? 0.15 : v >= 85 ? 0.3 : v >= 80 ? 0.45 : v >= 70 ? 0.7 : v >= 60 ? 0.9 : 1),
  /** XP needed for the next point of a stat at level v; `npc`: the league's curve (no steep part — PEOPLE growth is calibrated on it). */
  need(v, npc = false) {
    const X = TRAIN_X.xp,
      [at, k] = npc ? [Infinity, 1] : X.steep;
    return Math.max(1, Math.round(X.base * Math.pow(X.grow, Math.min(v, at) - X.from) * Math.pow(k, Math.max(0, v - at))));
  },
  /** A stat's level (wit in 0.02 steps). */
  level: (you, stat) => (stat === 'wit' ? Math.round(you.wit * 50) : Body.isKey(stat) && you.body ? you.body[stat] : you[stat]),
  /** The key XP goes to: yours land on the body (a court skill → its body stat, BODY.of); wit as it is. */
  key: (run, stat) => (Body.of(Run.you(run)) ? Body.key(stat) : stat),
  /** The training cap this season: TRAIN_CAP in year 1, SEASON.cap in year 2 (spec §4.32). */
  cap: run => (Season.year(run) > 1 ? SEASON.cap : TRAIN_CAP),
  /** Where a stat stops for a source of XP: 'train' (sessions, default) → Training.cap; 'match' → the run cap. Wit: its own cap. */
  top: (run, stat, src = 'train') =>
    stat === 'wit' ? Math.round(CAREER.witRunCap * 50) : src === 'match' ? CAREER.runCap : Training.cap(run),
  /** XP a session gives a stat: its base gain (wit converted to 0.02 steps) × per × the multiplier. */
  xpFor: (stat, base, mul) => Math.round((stat === 'wit' ? base * 50 : base) * TRAIN_X.xp.per * mul),
  /** Adding xp to a stat: { pts, have } — points gained and the XP left toward the next one (none past the top). */
  sim(run, stat, xp, src = 'train') {
    stat = Training.key(run, stat);
    const top = Training.top(run, stat, src);
    const g = Gifts.grow(run, Run.you(run), src, stat); // your learned growth gifts (spec §4.35)
    if (g !== 1) xp = Math.round(xp * g);
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
    stat = Training.key(run, stat);
    const you = Run.you(run),
      r = Training.sim(run, stat, xp, src);
    if (Training.tally) Training.tally[stat] = (Training.tally[stat] || 0) + xp; // the result card's "+N XP" (opened by resultSnap)
    (run.xp || (run.xp = {}))[stat] = r.have;
    if (stat === 'wit') you.wit = +(you.wit + r.pts * 0.02).toFixed(2);
    else if (Body.isKey(stat) && you.body) {
      you.body[stat] += r.pts;
      if (r.pts) Body.sync(you, run); // the court skills follow the body (spec §4.33)
    } else you[stat] += r.pts;
    const gl = Body.glyph(stat);
    return r.pts ? `${gl}+${stat === 'wit' ? (r.pts * 0.02).toFixed(2) : r.pts}` : `${gl}…`; // ▲+1 / ▲… (spec §9.4)
  },
  /** XP toward the next point: { have, need } (for the stat bars). */
  progress(run, stat) {
    stat = Training.key(run, stat);
    return { have: (run.xp && run.xp[stat]) || 0, need: Training.need(Training.level(Run.you(run), stat)) };
  },
  /** What a session would do (h: its hours, spec §4.41 — stamina, fail chance, pay; x carries its gains' units). */
  preview(run, key, hard, x = 1, at = null, h = null) {
    const T = Training.def(key),
      hd = hard && T.kind !== 'stretch',
      mul = Training.mul(run, key, hd, x, at),
      mates = Training.matesAt(run, key, at),
      rub = Gifts.rub(run, mates), // gifts rubbing off from friends on the floor (spec §4.35, T-323)
      mk = k => mul * rub.all * (rub.keys[Training.key(run, k)] || 1),
      row = ([k, b]) => [k, Training.gain(run, k, b, mk(k)), Training.xpFor(k, b, mk(k))];
    return {
      main: row(T.main),
      side: row(T.side),
      more: (T.more || []).map(row),
      fixed: !!Training.fixed(at || key),
      sta: Training.staCost(run, key, hd, h),
      fail: T.kind === 'stretch' ? 0 : Training.failP(run, hd, h),
      h,
      lvl: Training.facility(run, at || key) + 1,
      next: Training.toNext(run, at || key),
      pay: Math.round((T.pay || 0) * (h ? Training.units(h) / Training.units(2) : 1)),
      streak: Training.streakBonus(run, key),
      cap: T.main[0] !== 'wit' && Training.level(Run.you(run), T.main[0]) >= Training.cap(run) ? Training.cap(run) : null,
      mates,
      rub: rub.from
    };
  },
  /** Train (hard = the Hard option; not while injured; x = the place's multiplier; spMul = skill points ×). Returns a summary line for the log. */
  train: (run, key, hard, x = 1, spMul = 1) => Training.session(run, key, null, hard, x, spMul),
  /**
   * A day order (spec §4.33) at place `at` (a SPOTS id, or null: a map point): its body gains, stamina, a Work order's pay; the
   * facility level grows per kit place. Same rules as a training (fail when tired, Hard, mates, streak). Returns the log line.
   */
  order: (run, oid, at, hard, x = 1, spMul = 1, h = null) => Training.session(run, oid, at, hard, x, spMul, h),
  /** A run (T-309): City.runPlan's gains through the usual multipliers (× DAY_GAIN), its stamina; no fail roll, no facility. The log text. */
  runTrip(run, plan) {
    const mul = Training.mul(run, 'run', false, DAY_GAIN),
      out = [];
    run.trained = 1;
    run.lastMain = Object.keys(plan.gains).reduce((a, k) => (plan.gains[k] > (plan.gains[a] || 0) ? k : a), 'end');
    for (const k of BODY.keys) if (plan.gains[k]) out.push(Training.addXp(run, k, Training.xpFor(k, plan.gains[k], mul)));
    out.push(Run.bump(run, 'sta', -plan.sta));
    Feel.add(run, 'drive', FEEL.drive.train * HOURS.unit);
    return out.filter(Boolean).join(', ');
  },
  /** A session; h = its hours (spec §4.41: a day order — stamina, fail and injury by the hours, pay, facility uses and Drive × its units; null: the old day session). */
  session(run, key, at, hard, x = 1, spMul = 1, h = null) {
    const T = Training.def(key),
      O = DAY_ORDERS[key];
    hard = hard && !run.injury && (!O || O.kind !== 'stretch');
    const pv = Training.preview(run, key, hard, x, at, h),
      u = h ? Training.units(h) : 1,
      out = [],
      name = O
        ? `${hard ? 'Hard ' : ''}${O.name}${run.injury ? ' (light)' : ''}`
        : `${hard ? 'Hard ' : ''}${T.name}${run.injury ? ' (light)' : ''} training`;
    run.lastMain = pv.main[0];
    run.trained = 1;
    run.streak = run.streak && run.streak.key === key ? { key, n: run.streak.n + 1 } : { key, n: 1 };
    if (R() < pv.fail) {
      run.streak = null;
      out.push(Run.bump(run, 'sta', -pv.sta));
      // exhausted: a failed session can injure you
      const ip =
        ((run.sta < TRAIN_X.injuryAt ? 0.5 : 0) + ((h && HOURS.inj[h]) || 0)) * (Feel.has(run, 'glassAnkle') ? SCARS.glassAnkle.k : 1); // a long session can hurt even rested (§4.41)
      if (ip > 0 && !run.injury && R() < ip) {
        run.injury = { weeks: R() < 0.5 ? 1 : 2 };
        out.push(Run.bump(run, 'mood', -1));
        return `${name} failed — injured! Light training only for ${run.injury.weeks} week${run.injury.weeks > 1 ? 's' : ''}: ${out.filter(Boolean).join(', ')}`;
      }
      out.push(Run.bump(run, pv.main[0], pv.main[0] === 'wit' ? -0.03 : -3), Run.bump(run, 'mood', -1));
      return `${name} failed: ${out.filter(Boolean).join(', ')}`;
    }
    for (const [k, , xp] of [pv.main, pv.side, ...pv.more]) out.push(Training.addXp(run, k, xp));
    out.push(
      Run.bump(run, 'sta', -pv.sta),
      Run.bump(run, 'sp', Math.round(CAREER.spPerTraining * (hard ? 1.5 : 1) * spMul * (O && O.kind !== 'drill' ? 0.5 : 1)))
    );
    if (pv.pay) {
      run.money += pv.pay; // a Work order pays (spec §4.33)
      out.push(`+$${pv.pay}`);
    }
    const gen = hasGift(Run.you(run), 'generous') ? GIFTS.generous.k : 1, // Generous (yours): your mates take × more (spec §4.35)
      share = gen === 1 ? pv : { main: [pv.main[0], pv.main[1] * gen], side: [pv.side[0], pv.side[1] * gen] };
    const C = h && City.clock(run),
      met = C ? C.met || (C.met = []) : [];
    for (const id of pv.mates) {
      if (!met.includes(id)) out.push(Run.bond(run, id, undefined, hard ? 'trained_hard' : 'trained')); // a Hard session side by side (Competitive × 2, spec §4.35); once a day (§4.41)
      if (C) met.push(id);
      Growth.shared(run, id, share);
    }
    const fk = at || key, // the facility that levels: the place (an order), else the training key
      grows = at ? !!(SPOTS[at] && SPOTS[at].kit) : !O,
      lv0 = Training.facility(run, fk);
    if (grows) run.uses[fk] = +((run.uses[fk] || 0) + u).toFixed(2); // an old day session = one use (§4.41: × the hours' units)
    Feel.add(run, 'drive', FEEL.drive.train * (h ? u : 1));
    if (grows && Training.facility(run, fk) > lv0)
      out.push(`${at ? SPOTS[at].name : T.name} facility Lv ${Training.facility(run, fk) + 1}`);
    return `${name}${Training.camp(run) ? ' (camp)' : ''}: ${out.filter(Boolean).join(', ')}`;
  },
  /** Rest: stamina × how well you sleep (your home — or `mul`, e.g. a hotel away from home). */
  rest(run, mul = null) {
    const out = [
      Run.bump(
        run,
        'sta',
        Math.round(rnd(30, 60) * (mul == null ? World.restMul(run) : mul) * (Feel.has(run, 'insomnia') ? SCARS.insomnia.k : 1)) // Insomnia (spec §4.30)
      )
    ];
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
