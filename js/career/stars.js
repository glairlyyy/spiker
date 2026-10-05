// The named players (spec §4.29, lore §6): seats the rival and the cohort on their clubs at the start of a run, marks the
// first aces, and moves all of them along their authored curves each week. DOM-free; draws no randoms (fixed data and the
// clubs' own players), so a run's main random stream is unchanged by them. A named player has `named` = 'rival' | 'cohort' |
// 'ace' and `nkey` (STARS key, or 'ace-<region>'); World / People never transfer, poach, cut or break them through.

const Stars = {
  /** Seat the cohort and mark the first aces (Run.create; new runs only). */
  seat(run) {
    for (const s of STARS.cohort) {
      const t = run.teams[s.club];
      if (!t) continue;
      const sq = squadOf(t),
        same = sq.filter(p => p.role === s.role && !p.named),
        old = (same.length ? same : sq.filter(p => !p.named)).reduce((a, p) => (ovr(p) < ovr(a) ? p : a)),
        p = createPlayer({
          id: `star_${s.key}`,
          name: s.name,
          role: s.role,
          slot: old.slot,
          num: old.num,
          lead: s.lead,
          wit: s.wit[0],
          hair: s.hair,
          look: { ...s.look },
          move: s.move,
          bmove: BMOVES[0],
          team: t,
          pot: 1,
          named: s.kind,
          nkey: s.key,
          curve: { ovr: s.ovr, wit: s.wit }
        }),
        arr = t.P.includes(old) ? t.P : t.bench;
      arr[arr.indexOf(old)] = p;
      [t.s, t.mb] = t.P;
      t.ws = [t.P[2], t.P[3]];
      Stars.shape(p, s.ovr[0]);
      finalizeTeam(t);
    }
    const given = STARS.cohort.map(s => s.name.split(' ')[0]); // nicknames (names are `<nickname> <family>`)
    for (const [ci, role] of STARS.aces.clubs) {
      const t = run.teams[ci];
      if (!t) continue;
      const free = squadOf(t).filter(q => !q.named),
        of = free.filter(q => q.role === role),
        p = (of.length ? of : free).reduce((a, q) => (ovr(q) > ovr(a) ? q : a)),
        [giv, fam] = p.name.split(' ');
      if (given.includes(giv)) {
        const alt = GIV.filter(n => !given.includes(n)); // no first ace shares a first name with the cohort
        p.name = `${alt[Math.floor(hstr(p.name) * alt.length)]} ${fam}`;
      }
      Object.assign(p, { named: 'ace', nkey: `ace-${FACTIONS[ci].region}`, pot: 1, curve: { ovr: STARS.aces.ovr, wit: STARS.aces.wit } });
      p.wit = STARS.aces.wit[0];
      Stars.shape(p, STARS.aces.ovr[0]);
      finalizeTeam(t);
    }
  },
  /** Every named player still in a squad. */
  all: run => run.teams.flatMap(t => squadOf(t)).filter(p => p.named),
  /** A named player by key ('rival', 'reina', …, 'ace-wei'), or null. */
  get: (run, key) => Stars.all(run).find(p => p.nkey === key) || null,
  /** The curve's target this week: week 1 → the last week (the year-1 Cup), linear. */
  target(run, c) {
    const t = clamp((run.week - 1) / Math.max(1, CAREER.weeks - 1), 0, 1);
    return { ovr: Math.round(lerp(c.ovr[0], c.ovr[1], t)), wit: +lerp(c.wit[0], c.wit[1], t).toFixed(2) };
  },
  /** Set p's stats to its role's shape at OVR `o` (key stat highest), capped at 99. */
  shape(p, o) {
    const P = STARS.profile[p.role] || STARS.profile.WS;
    let base = o;
    for (let i = 0; i < 4; i++) {
      for (const k of STATK) p[k] = Math.round(clamp(base + (P[k] || 0), STAT_FLOOR, 99));
      base += o - ovr(p);
    }
  },
  /** A week on: each named player to its curve; star / OP follow the career criteria (CAREER.star / op). */
  week(run) {
    const C = CAREER;
    for (const p of Stars.all(run)) {
      if (!p.curve) continue;
      const T = Stars.target(run, p.curve);
      p.wit = T.wit;
      Stars.shape(p, T.ovr);
      const o = ovr(p);
      p.star = o >= C.star.ovr;
      p.op = p.star && o >= C.op.ovr && p[KEYSTAT[p.role]] >= C.op.key && p.wit >= C.op.wit;
      p.bonus = p.op ? 110 : p.star ? 18 : 0;
    }
  }
};
