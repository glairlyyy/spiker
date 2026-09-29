// Career run: the run object, creating your player, joining a team, stat changes, week flow, save/resume.
// No DOM here — the career UI calls these and re-renders.

/** The active run (or null). */
let RUN = null;

const Run = {
  /** Teams for a new run (the league generator) plus a pre-rolled team for the player. */
  draft() {
    const teams = mkLeagueTeams();
    for (const t of teams) for (const p of t.P) p.pot = +rnd(GROWTH.pot[0], GROWTH.pot[1]).toFixed(2);
    // the island's clubs: each league team plays as its faction's squad
    for (const t of teams) if (FACTIONS[t.i] && FACTIONS[t.i].team) [t.name, t.short, t.color] = FACTIONS[t.i].team;
    return { teams, team: Math.floor(R() * teams.length) };
  },
  /** Final stat value shown at creation: base + allocated points + the role's usual bias. */
  createdStat: (role, k, alloc) => clamp(CAREER.statBase + alloc + (RB[role][k] || 0), 25, 99),
  /**
   * Start a run. spec = { role, name, alloc: {power, def, speed, jump}, witSteps, team?, skill?,
   *   pure? (every Legacy unlock off), mode? ({hard, short}), legend? (Hall of Fame index to inherit from) }.
   * Your player takes the same-role slot on the team (the setter, the middle, or the first wing).
   */
  create(draft, spec) {
    const legacy = spec.pure ? [] : Legacy.active(),
      mode = spec.mode || {},
      legend = spec.legend != null && !spec.pure ? Legacy.load().hof[spec.legend] : null;
    const teams = draft.teams,
      free = spec.team == null, // no Team pick: you start as a free agent on a pickup squad
      pickup = free ? World.pickup(new Set(teams.flatMap(x => x.P.map(p => p.name)))) : null,
      ti = free ? null : spec.team,
      t = free ? pickup : teams[ti],
      role = spec.role,
      slot = role === 'S' ? 'S' : role === 'MB' ? 'MB' : 'W0',
      old = t.P.find(p => p.slot === slot),
      stats = {};
    for (const k of STATK) stats[k] = Run.createdStat(role, k, spec.alloc[k] || 0);
    // Hall of Fame inheritance: a tenth of the legend's gains over 40 in each stat, and one of their skills
    if (legend)
      for (const k of STATK)
        stats[k] = Math.min(Legacy.createCap(legacy) + 5, stats[k] + Math.max(0, Math.round(((legend.stats[k] || 40) - 40) * 0.1)));
    const inherit = legend ? (legend.skills || []).find(id => SKILLS[id] && skillRoleOk(SKILLS[id], role) && id !== spec.skill) : null;
    const you = createPlayer({
      name: spec.name,
      role,
      slot,
      wit: +(CAREER.witBase + spec.witSteps * CAREER.witStep).toFixed(2),
      hair: pick(HAIR),
      look: mkLook(role),
      move: pick(MOVES[role]),
      bmove: pick(BMOVES),
      team: t,
      num: old.num,
      lead: Math.round(rnd(30, 60)),
      you: true,
      ...(legend && legend.el ? { el: legend.el, sig: legend.sig, elSeen: true } : {}), // an heir knows their element at once
      skills: [spec.skill, inherit].filter(Boolean),
      bond: {},
      ...stats
    });
    t.P[t.P.indexOf(old)] = you;
    [t.s, t.mb] = t.P;
    t.ws = [t.P[2], t.P[3]];
    for (const m of t.P) if (m !== you) you.bond[m.id] = 0;
    finalizeTeam(t);
    // Hard league: everyone else starts stronger and grows faster
    if (mode.hard)
      for (const T of teams) {
        for (const p of T.P)
          if (p !== you) {
            for (const k of STATK) p[k] = Math.min(99, p[k] + 5);
            p.pot = +((p.pot || 1) + 0.25).toFixed(2);
          }
        finalizeTeam(T);
      }
    // a Hall of Fame legend may turn up as a star on another team
    const hof = spec.pure ? [] : Legacy.load().hof.filter(h => h !== legend);
    if (hof.length && R() < 0.5) Run.addLegend(teams, ti == null ? -1 : ti, pick(hof));
    const staMax = Legacy.staMax(legacy);
    const run = {
      v: RUN_VERSION,
      week: mode.short ? 5 : 1,
      teams,
      team: ti,
      youId: you.id,
      sta: staMax,
      staMax,
      mood: 2,
      sp: 0,
      fans: 0,
      uses: {},
      floor: {},
      seen: [],
      log: [],
      event: null,
      cup: null,
      warm: [],
      plays: { k: 0, blk: 0, ace: 0 },
      lastMain: KEYSTAT[role],
      result: null,
      // v3: Legacy set in force, challenge modes, two cups, training depth, goals, sponsors, history
      legacy,
      pure: !!spec.pure,
      mode: { hard: !!mode.hard, short: !!mode.short },
      legend: legend ? legend.name : null,
      cups: [],
      lb: Object.fromEntries(STATK.map(k => [k, 0])),
      streak: null,
      injury: null,
      goal: null,
      sponsors: [],
      sponsorN: 0,
      focus: null,
      talk: null,
      trained: 0,
      hist: [],
      // v4: the Element Trial (S grade in the zone done? next offer week)
      elProof: false,
      elNext: 0,
      // v5: free agency (pickup squad until you sign), money, housing, league news and the Gazette
      pickup,
      money: ECON.start,
      housing: 'studio',
      news: [],
      gazette: null,
      // the city map: days left this week, whether the week's event was rolled, scouted clubs (team index → week)
      days: WEEK_DAYS,
      rolled: false,
      rep: {}, // standing with each region's clubs
      own: {}, // seized border places → the region holding them
      front: {}, // pressure on each major border (FRONT.borders key → net wins)
      clash: null, // this week's street battle
      scout: {},
      spotQ: {},
      xp: {}, // training experience toward each stat's next point
      loc: 'wu', // off the plane at the airport, on the coast
      pos: CITY.airport.slice(), // where you stand on the map
      fog: [CITY.airport.slice()] // the points you've stood on (the map is dark elsewhere)
    };
    Run.log(
      run,
      free
        ? `${you.name} arrives in the city as a free agent (${ROLE_NAME[role].toLowerCase()}) — find a club that will take you.`
        : `${you.name} joins ${t.name} as ${ROLE_NAME[role].toLowerCase()}.`
    );
    if (legend)
      Run.log(
        run,
        `Inherited from Hall of Famer ${legend.name}${inherit ? ` — including ${SKILLS[inherit].name}` : ''}${legend.el ? `. Your element is ${ENAME[legend.el]}` : ''}.`
      );
    Legacy.applyStart(run);
    City.roll(run); // the island's places: which premium ones are overhyped, which rough ones are gems
    Training.rollFloor(run);
    Goals.set(run);
    Run.snap(run);
    return run;
  },
  /** Put a Hall of Fame legend on a random other team as a ★ star (in their role's slot). */
  addLegend(teams, mine, h) {
    const others = teams.filter(t => t.i !== mine),
      t = pick(others),
      slot = h.role === 'S' ? 'S' : h.role === 'MB' ? 'MB' : 'W1',
      old = t.P.find(p => p.slot === slot);
    if (!old) return;
    const st = {};
    for (const k of STATK) st[k] = Math.round((h.stats[k] || 60) * 0.92);
    const p = createPlayer({
      name: h.name,
      role: h.role,
      slot,
      wit: +Math.min(2, (h.stats.wit || 1.2) * 0.92).toFixed(2),
      hair: old.hair,
      look: mkLook(h.role),
      move: old.move,
      bmove: old.bmove,
      team: t,
      num: old.num,
      lead: h.stats.lead || 60,
      star: true,
      bonus: 18,
      legend: true,
      pot: 1,
      ...(h.el ? { el: h.el, sig: h.sig, elOn: !!h.elOn } : {}),
      ...st
    });
    t.P[t.P.indexOf(old)] = p;
    [t.s, t.mb] = t.P;
    t.ws = [t.P[2], t.P[3]];
    finalizeTeam(t);
  },
  /** The cup being played right now (or null between cups). */
  cupDef: run => (run.cup && !run.cup.done ? CUPS.find(c => c.id === run.cup.id) : null),
  /** Weekly snapshot for the growth chart on the result screen. */
  snap(run) {
    const you = Run.you(run);
    run.hist.push({ w: run.week, ovr: ovr(you), ...Object.fromEntries(STATK.map(k => [k, you[k]])), wit: you.wit });
  },
  /** Your team: a league club, or the pickup squad while you're a free agent (run.team null). */
  myTeam: run => (run.team == null ? run.pickup : run.teams[run.team]),
  /** League news for the next Gazette. */
  news(run, text) {
    (run.news || (run.news = [])).push(text);
  },
  you: run => Run.myTeam(run).P.find(p => p.id === run.youId),
  mates: run => Run.myTeam(run).P.filter(p => p.id !== run.youId),
  /** What this week is: 'train' | 'camp' | 'warmup' | 'warmup2' | 'cup'. */
  weekType: run => (Run.cupDef(run) ? 'cup' : CALENDAR[run.week] || 'train'),
  log(run, text) {
    const c = Run.cupDef(run);
    run.log.unshift({ w: c ? c.short : run.week, t: text });
    run.log.length = Math.min(run.log.length, 50);
  },
  /**
   * Change one of your values, respecting caps. key: a stat, 'wit', 'lead', 'sta', 'mood', 'sp', 'fans'.
   * Returns a short label such as "+6 Power" (empty if nothing changed).
   */
  bump(run, key, v) {
    const you = Run.you(run);
    const fmt = (d, name, dec = 0) => (d ? `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(dec)} ${name}` : '');
    if (STATK.includes(key) || key === 'lead') {
      if (v > 0 && key !== 'lead') v = Math.max(1, Math.round(v * Training.dim(you[key]))); // events obey diminishing returns too
      const top = key === 'lead' ? CAREER.runCap : Math.max(you[key], Training.gate(run, key)), // limit-break gates
        nv = Math.round(clamp(you[key] + v, 25, top)),
        d = nv - you[key];
      you[key] = nv;
      return fmt(d, STATNAME[key]);
    }
    if (key === 'wit') {
      const nv = +clamp(you.wit + v, 0.1, CAREER.witRunCap).toFixed(2),
        d = nv - you.wit;
      you.wit = nv;
      return fmt(d, 'Wit', 2);
    }
    if (key === 'sta') {
      const nv = Math.round(clamp(run.sta + v, 0, run.staMax)),
        d = nv - run.sta;
      run.sta = nv;
      return fmt(d, 'stamina');
    }
    if (key === 'mood') {
      const nv = clamp(run.mood + v, 0, MOODS.length - 1),
        d = nv - run.mood;
      run.mood = nv;
      return d ? `mood ${d > 0 ? 'up' : 'down'} (${MOODS[nv].name})` : '';
    }
    if (key === 'sp' || key === 'fans') {
      run[key] = Math.max(0, run[key] + v);
      return fmt(v, key === 'sp' ? 'skill pts' : 'fans');
    }
    throw new Error('Unknown key ' + key);
  },
  /** Change your bond with a teammate by `v` (0–100). Returns a short label such as "+7 bond with Aoi". */
  bond(run, mateId, v) {
    const you = Run.you(run),
      m = Run.myTeam(run).P.find(p => p.id === mateId);
    if (!m) return ''; // that teammate is gone (you changed club, or they were transferred)
    const nv = clamp((you.bond[mateId] || 0) + v, 0, 100),
      d = nv - (you.bond[mateId] || 0);
    you.bond[mateId] = nv;
    return d ? `${d > 0 ? '+' : '−'}${Math.abs(d)} bond with ${m.name}` : '';
  },
  /**
   * Close the week: the league grinds, the coach's goal and sponsor deals are checked, an injury heals a little;
   * then the next week (or a cup, after week 24 and week 28) begins.
   */
  endWeek(run) {
    Growth.week(run);
    Goals.check(run);
    Sponsors.tick(run);
    if (run.injury && --run.injury.weeks <= 0) {
      run.injury = null;
      Run.log(run, 'Fully recovered from the injury.');
    }
    World.week(run);
    if (City.clashSite(run)) Run.log(run, City.clashEnd(run));
    run.trained = 0;
    run.days = WEEK_DAYS;
    run.rolled = false;
    run.clash = null;
    Run.snap(run);
    run.week++;
    const cup = CUPS.find(c => c.after === run.week - 1);
    if (cup) Cup.start(run, cup);
    else Run.nextWeek(run);
    Run.save(run);
  },
  /** A training week begins: who's at which training, a new coach's goal at the start of a block, sponsor offers. */
  nextWeek(run) {
    City.clashRoll(run);
    Training.rollFloor(run);
    Goals.set(run);
    Sponsors.offer(run);
    ElTrial.offer(run);
  },
  /** Save the run (teams in their compact JSON form). */
  save(run) {
    store.setJSON(
      KEYS.career,
      Object.assign({}, run, { teams: run.teams.map(teamToJSON), pickup: run.pickup ? teamToJSON(run.pickup) : null })
    );
  },
  /** Load the saved run, upgrading older save formats step by step (see RUN_MIGRATIONS). */
  load() {
    let d = store.getJSON(KEYS.career, null);
    if (!d || typeof d.v !== 'number' || d.v > RUN_VERSION) return null;
    try {
      while (d.v < RUN_VERSION) {
        const up = RUN_MIGRATIONS[d.v];
        if (!up) return null;
        d = up(d);
      }
      const run = Object.assign(d, { teams: d.teams.map(teamFromJSON), pickup: d.pickup ? teamFromJSON(d.pickup) : null });
      if (!Run.myTeam(run) || !Run.you(run)) return null; // corrupt save: your player is missing
      Run.repair(run);
      elAll(run.teams); // players from older saves get their element
      return run;
    } catch (e) {
      return null;
    }
  },
  /** Fill collections and counters a damaged save may lack, so the career screens never meet undefined / NaN. */
  repair(run) {
    for (const k of ['log', 'seen', 'warm', 'cups', 'sponsors', 'hist']) if (!Array.isArray(run[k])) run[k] = [];
    for (const k of ['sp', 'fans', 'trained', 'elNext', 'money']) if (!Number.isFinite(run[k])) run[k] = 0;
    if (!HOUSING[run.housing]) run.housing = 'studio';
    if (!Array.isArray(run.news)) run.news = [];
    if (!Number.isFinite(run.days) || run.days < 0 || run.days > WEEK_DAYS) run.days = WEEK_DAYS;
    delete run.slot;
    if (!run.spotQ || typeof run.spotQ !== 'object' || !Object.keys(run.spotQ).length) City.roll(run);
    if (!run.scout || typeof run.scout !== 'object') run.scout = {};
    for (const k of ['rep', 'own', 'front']) if (!run[k] || typeof run[k] !== 'object') run[k] = {};
    if (!Array.isArray(run.pos)) run.pos = (REGIONS[run.loc] || REGIONS.wu).at.slice();
    if (!Array.isArray(run.fog)) run.fog = [run.pos.slice()];
    if (run.clash && !CLASH.sites[run.clash.site]) run.clash = null;
    if (!Number.isFinite(run.staMax) || run.staMax <= 0) run.staMax = Legacy.staMax(run.legacy);
    if (!Number.isFinite(run.sta)) run.sta = run.staMax;
    if (!Number.isInteger(run.mood) || !MOODS[run.mood]) run.mood = 2;
    if (!run.mode || typeof run.mode !== 'object') run.mode = { hard: false, short: false };
    if (!run.plays || typeof run.plays !== 'object') run.plays = { k: 0, blk: 0, ace: 0 };
    if (!run.uses || typeof run.uses !== 'object') run.uses = {};
    if (!run.xp || typeof run.xp !== 'object') run.xp = {};
    if (!run.floor || typeof run.floor !== 'object') run.floor = {};
    if (!run.lb || typeof run.lb !== 'object') run.lb = Object.fromEntries(STATK.map(k => [k, 0]));
    // an event this version no longer knows (removed / renamed) would leave the week stuck on a blank card
    if (run.event && !Events.def(run.event, run)) run.event = null;
  },
  /** Delete the saved run. */
  clear() {
    store.remove(KEYS.career);
  }
};
/**
 * Save format version. When the saved shape changes: bump RUN_VERSION and add a migration from the
 * previous version below, so players keep their run. Each migration takes the raw saved object
 * (teams still in JSON form) and returns it at version + 1.
 */
const RUN_VERSION = 1;
/** version → upgrade step (none yet: the game started fresh; add steps when the saved shape changes). */
const RUN_MIGRATIONS = {};
const ROLE_NAME = { S: 'Setter', MB: 'Middle blocker', WS: 'Wing spiker' };
