// The island map phase of a training week: a day action (train at a place, rest at home, recreation in the park)
// and one optional evening outing (dinner, a night out, street hustle, scouting a club HQ, an early night).
// Places belong to regions (REGIONS): the region sets the price and the quality; Wei's premium places may turn out
// overhyped and Shu's rough ones may be hidden gems (rolled per run, found out by training there). A trip between
// the highlands and the rest of the island takes the evening. DOM-free (runs headless in tests).

const City = {
  /** 'day' until the week's main action is done, then 'eve' ('done' after a long trip: no evening). */
  slot: run => (run.slot === 'eve' || run.slot === 'done' ? run.slot : 'day'),
  /** Region of a place (home: where you live). */
  region: (run, id) => SPOTS[id].region || (HOUSING[run.housing] || HOUSING.studio).region || 'open',
  /** Map position of a place (home moves with your housing). */
  at: (run, id) => (SPOTS[id].at ? SPOTS[id].at : HOME_AT[run.housing] || HOME_AT.studio),
  /** The training places for a key. */
  spotsFor: key => Object.keys(SPOTS).filter(id => SPOTS[id].train === key),
  /** Your faction's region (null while a free agent). */
  myRegion: run => (run.team != null && FACTIONS[run.team] ? FACTIONS[run.team].region : null),
  /** Home-turf bonus at a place: it lies in your faction's region. */
  turf(run, id) {
    const r = City.myRegion(run);
    return r && City.region(run, id) === r ? TURF_BONUS : 0;
  },
  /**
   * Quality of every place this run: { id: { q, tag, known } }. Wei places are advertised premium but may be
   * overhyped; Shu places are rough but may be hidden gems — both found out once you've trained there.
   */
  roll(run) {
    run.spotQ = {};
    for (const id of Object.keys(SPOTS)) {
      const s = SPOTS[id],
        R0 = REGIONS[s.region];
      if (!s.train || !R0) continue;
      let q = R0.q,
        tag = '',
        known = true;
      if (R0.hype) {
        known = false;
        if (R() < R0.hype) ((q = 1), (tag = 'overhyped'));
      } else if (R0.gem) {
        known = false;
        if (R() < R0.gem) ((q = 1.25), (tag = 'gem'));
      }
      run.spotQ[id] = { q, tag, known };
    }
  },
  quality: (run, id) => (run.spotQ && run.spotQ[id]) || { q: (REGIONS[SPOTS[id].region] || REGIONS.open).q, tag: '', known: true },
  /** Money for a session / outing / hotel night at a place (0 at home and in the park). */
  price(run, id) {
    const s = SPOTS[id],
      R0 = REGIONS[City.region(run, id)] || REGIONS.open;
    if (s.train) return Math.round(TRAIN_FEE * R0.price);
    if (s.hotel) return Math.round(HOTEL.price * R0.price);
    return s.cost ? Math.round(s.cost * R0.price) : 0;
  },
  /** Gain multiplier of a session at a place: its quality × home turf. */
  mul: (run, id) => City.quality(run, id).q * (1 + City.turf(run, id)),
  /** A trip between the highlands and the rest of the island (either way) takes the evening too. */
  /** Where you are now (a region); a new run starts where you live. */
  loc: run => (REGIONS[run.loc] ? run.loc : City.region(run, 'home')),
  /** Travel from where you are to region r: 0 here, 1 near (takes the evening), 2 far (takes the day). */
  travel(run, r) {
    const a = REGIONS[City.loc(run)],
      b = REGIONS[r];
    return a && b ? TRAVEL[a.zone][b.zone] : 0;
  },
  /** Kept for callers: a trip that isn't free. */
  far: (run, id) => City.travel(run, City.region(run, id)) > 0,
  farTo: (run, r) => City.travel(run, r) > 0,
  /** Your home region (where you live). */
  homeRegion: run => City.region(run, 'home'),
  /** Can you do this now? { ok, why }. */
  can(run, id, mate) {
    const s = SPOTS[id];
    if (!s) return { ok: false, why: 'unknown place' };
    if (run.event) return { ok: false, why: 'answer the event first' };
    if (s.slot !== City.slot(run)) return { ok: false, why: s.slot === 'day' ? 'day action done' : 'evenings come after the day' };
    const cost = City.price(run, id),
      t = City.travel(run, City.region(run, id));
    if (cost && run.money < cost) return { ok: false, why: `needs $${cost}` };
    if (s.slot === 'day' && t >= 2) return { ok: false, why: 'too far — travel there first (takes the day)', travel: true };
    if (s.slot === 'eve' && t > 0) return { ok: false, why: 'evenings are spent where you are' };
    if ((id === 'home' || id === 'sleep') && t > 0) return { ok: false, why: 'you are away from home — rest at a hotel here, or go home' };
    if (s.act === 'ramen' && !Run.mates(run).some(p => p.id === mate)) return { ok: false, why: 'pick a teammate' };
    return { ok: true, why: '' };
  },
  /**
   * Day action at a place: returns the diary line (the caller rolls events, then the evening — or ends the week at
   * once if run.slot is 'done': a long trip).
   */
  day(run, id, hard) {
    if (!City.can(run, id).ok) return '';
    const s = SPOTS[id],
      cost = City.price(run, id),
      out = [];
    let line;
    if (s.train) {
      run.money -= cost;
      const Q = City.quality(run, id);
      line = Training.train(run, s.train, hard, City.mul(run, id), s.sand ? SAND_SP : 1);
      if (!Q.known && run.spotQ && run.spotQ[id]) {
        run.spotQ[id].known = true;
        if (Q.tag === 'overhyped') out.push(`${s.name} turned out overhyped — just average for the price`);
        else if (Q.tag === 'gem') out.push(`${s.name} is a hidden gem — top quality for next to nothing!`);
        else
          out.push(
            `${s.name}: ${REGIONS[s.region].kind === 'major' && REGIONS[s.region].hype ? 'worth every penny' : 'as rough as it looks'}`
          );
      }
      line = `${line} (−$${cost})${out.length ? ' · ' + out.join('; ') : ''}`;
    } else if (s.act === 'rest') {
      if (s.hotel) run.money -= cost;
      line = `${s.hotel ? `${s.name} (−$${cost}): ` : ''}${Training.rest(run, s.hotel ? HOTEL.rest : null)}`;
    } else line = Training.recreation(run);
    const t = City.travel(run, City.region(run, id));
    run.loc = City.region(run, id); // you are there now
    run.slot = t ? 'done' : 'eve';
    return t ? `${line} · Getting there took the evening.` : line;
  },
  /** Evening outing: returns the diary line. The week ends after it (the caller calls Run.endWeek). */
  evening(run, id, mate) {
    if (!City.can(run, id, mate).ok) return '';
    const s = SPOTS[id],
      cost = City.price(run, id),
      out = [];
    if (cost) {
      run.money -= cost;
      out.push(`−$${cost}`);
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
  /** Travel to region r (the week's day action): you arrive with the evening free. Returns the diary line. */
  travelTo(run, r) {
    if (run.event || City.slot(run) !== 'day' || !REGIONS[r] || r === City.loc(run)) return '';
    run.loc = r;
    run.slot = 'eve';
    return `Travelled to ${REGIONS[r].name} — the trip took the day.`;
  },
  /** Evening at a club HQ: scout them (roster, elements, a rumour). Returns the diary line. */
  scout(run, ti) {
    if (run.event || City.slot(run) !== 'eve' || !run.teams[ti] || City.farTo(run, FACTIONS[ti].region)) return '';
    const t = run.teams[ti],
      f = FACTIONS[ti];
    (run.scout || (run.scout = {}))[ti] = run.week;
    Run.news(run, `Rumour from ${f.name}: ${f.dark.toLowerCase()}.`);
    run.slot = 'day';
    return `Scouted ${t.name}: rating ${t.ovr}, ${t.P.filter(p => p.elOn).length} element user(s). ${Run.bump(run, 'sta', -SCOUT_STA)}`;
  },
  scouted: (run, ti) => !!(run.scout && run.scout[ti] != null)
};
