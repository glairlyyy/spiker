// The city map phase of a training week: a day action (train at a place, rest at home, recreation in the park)
// and one optional evening outing (dinner, arcade, street hustle, scouting a club HQ, an early night).
// DOM-free (runs headless in tests).

const City = {
  /** 'day' until the week's main action is done, then 'eve'. */
  slot: run => (run.slot === 'eve' ? 'eve' : 'day'),
  /** Map position of a place (home moves with your housing). */
  at: (run, id) => (SPOTS[id].at ? SPOTS[id].at : HOME_AT[run.housing] || HOME_AT.studio),
  /** The place where a training is done. */
  spotOf: key => Object.keys(SPOTS).find(id => SPOTS[id].train === key),
  /** Home-turf bonus for a training: its place lies in your club's district. */
  turf(run, key) {
    const s = SPOTS[City.spotOf(key)];
    return s && run.team != null && s.d === run.team ? TURF_BONUS : 0;
  },
  /** Can you do this now? { ok, why }. */
  can(run, id, mate) {
    const s = SPOTS[id];
    if (!s) return { ok: false, why: 'unknown place' };
    if (run.event) return { ok: false, why: 'answer the event first' };
    if (s.slot !== City.slot(run)) return { ok: false, why: s.slot === 'day' ? 'day action done' : 'evenings come after the day' };
    if (s.cost && run.money < s.cost) return { ok: false, why: `needs $${s.cost}` };
    if (s.act === 'ramen' && !Run.mates(run).some(p => p.id === mate)) return { ok: false, why: 'pick a teammate' };
    return { ok: true, why: '' };
  },
  /** Day action at a place: returns the diary line (the caller rolls events and moves to the evening). */
  day(run, id, hard) {
    if (!City.can(run, id).ok) return '';
    const s = SPOTS[id],
      line = s.train ? Training.train(run, s.train, hard) : s.act === 'rest' ? Training.rest(run) : Training.recreation(run);
    run.slot = 'eve';
    return line;
  },
  /** Evening outing: returns the diary line. The week ends after it (the caller calls Run.endWeek). */
  evening(run, id, mate) {
    if (!City.can(run, id, mate).ok) return '';
    const s = SPOTS[id],
      out = [];
    if (s.cost) {
      run.money -= s.cost;
      out.push(`−$${s.cost}`);
    }
    if (s.act === 'ramen') out.push(Run.bond(run, mate, 6), Run.bump(run, 'sta', 10));
    else if (s.act === 'arcade') {
      out.push(Run.bump(run, 'mood', 1));
      for (const m of Run.mates(run)) out.push(Run.bond(run, m.id, 3));
    } else if (s.act === 'sleep') out.push(Run.bump(run, 'sta', 10));
    else if (s.act === 'street') {
      const rival = Math.round(rnd(STREET.rival[0], STREET.rival[1])),
        you = ovr(Run.you(run)),
        win = R() < clamp(0.5 + (you - rival) / 40, 0.1, 0.9);
      out.push(`vs a ${rival}-rated hustler`);
      if (win) {
        const amt = Math.round(rnd(STREET.win[0], STREET.win[1]));
        run.money += amt;
        out.push(`won +$${amt}`, Run.bump(run, 'fans', STREET.fans));
      } else {
        const lost = Math.min(run.money, STREET.loss);
        run.money -= lost;
        out.push(`lost −$${lost}`);
      }
      out.push(Run.bump(run, 'sta', -STREET.sta));
    }
    run.slot = 'day';
    return `${s.name}: ${out.filter(Boolean).join(', ') || 'a quiet evening'}`;
  },
  /** Evening at a club HQ: scout them (roster, elements, a rumour). Returns the diary line. */
  scout(run, ti) {
    if (run.event || City.slot(run) !== 'eve' || !run.teams[ti]) return '';
    const t = run.teams[ti],
      f = FACTIONS[ti];
    (run.scout || (run.scout = {}))[ti] = run.week;
    Run.news(run, `Rumour from ${f.name}: ${f.dark.toLowerCase()}.`);
    run.slot = 'day';
    return `Scouted ${t.name}: rating ${t.ovr}, ${t.P.filter(p => p.elOn).length} element user(s). ${Run.bump(run, 'sta', -SCOUT_STA)}`;
  },
  scouted: (run, ti) => !!(run.scout && run.scout[ti] != null)
};
