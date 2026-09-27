// Career run: the run object, creating your player, joining a team, stat changes, week flow, save/resume.
// No DOM here — the career UI calls these and re-renders.

/** The active run (or null). */
let RUN = null;

const Run = {
  /** Teams for a new run (the league generator) plus a pre-rolled team for the player. */
  draft() {
    const teams = mkLeagueTeams();
    for (const t of teams) for (const p of t.P) p.pot = +rnd(GROWTH.pot[0], GROWTH.pot[1]).toFixed(2);
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
      ti = spec.team != null ? spec.team : draft.team,
      t = teams[ti],
      role = spec.role,
      slot = role === 'S' ? 'S' : role === 'MB' ? 'MB' : 'W0',
      old = t.P.find(p => p.slot === slot),
      stats = {};
    for (const k of STATK) stats[k] = Run.createdStat(role, k, spec.alloc[k] || 0);
    // Hall of Fame inheritance: a tenth of the legend's gains over 40 in each stat, and one of their skills
    if (legend) for (const k of STATK) stats[k] = Math.min(Legacy.createCap(legacy) + 5, stats[k] + Math.max(0, Math.round(((legend.stats[k] || 40) - 40) * 0.1)));
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
        for (const p of T.P) if (p !== you) {
          for (const k of STATK) p[k] = Math.min(99, p[k] + 5);
          p.pot = +((p.pot || 1) + 0.25).toFixed(2);
        }
        finalizeTeam(T);
      }
    // a Hall of Fame legend may turn up as a star on another team
    const hof = spec.pure ? [] : Legacy.load().hof.filter(h => h !== legend);
    if (hof.length && R() < 0.5) Run.addLegend(teams, ti, pick(hof));
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
      elNext: 0
    };
    Run.log(run, `${you.name} joins ${t.name} as ${ROLE_NAME[role].toLowerCase()}.`);
    if (legend) Run.log(run, `Inherited from Hall of Famer ${legend.name}${inherit ? ` — including ${SKILLS[inherit].name}` : ''}${legend.el ? `. Your element is ${ENAME[legend.el]}` : ''}.`);
    Legacy.applyStart(run);
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
  myTeam: run => run.teams[run.team],
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
  bond(run, mateId, v) {
    const you = Run.you(run),
      m = Run.myTeam(run).P.find(p => p.id === mateId);
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
    run.trained = 0;
    Run.snap(run);
    run.week++;
    const cup = CUPS.find(c => c.after === run.week - 1);
    if (cup) Cup.start(run, cup);
    else Run.nextWeek(run);
    Run.save(run);
  },
  /** A training week begins: who's at which training, a new coach's goal at the start of a block, sponsor offers. */
  nextWeek(run) {
    Training.rollFloor(run);
    Goals.set(run);
    Sponsors.offer(run);
    ElTrial.offer(run);
  },
  save(run) {
    store.setJSON(KEYS.career, Object.assign({}, run, { teams: run.teams.map(teamToJSON) }));
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
      const run = Object.assign(d, { teams: d.teams.map(teamFromJSON) });
      elAll(run.teams); // players from older saves get their element
      return run;
    } catch (e) {
      return null;
    }
  },
  clear() {
    store.remove(KEYS.career);
  }
};
/**
 * Save format version. When the saved shape changes: bump RUN_VERSION and add a migration from the
 * previous version below, so players keep their run. Each migration takes the raw saved object
 * (teams still in JSON form) and returns it at version + 1.
 */
const RUN_VERSION = 4;
const RUN_MIGRATIONS = {
  // v1 → v2: 12-week calendar became 24 weeks; players gained a hidden growth potential.
  1: d => {
    d.week = d.week > 12 ? 25 : Math.round(((d.week - 1) * 24) / 12) + 1;
    for (const t of d.teams) for (const p of t.P) if (p.pot == null) p.pot = 1;
    d.warmOpp = null;
    d.v = 2;
    return d;
  },
  // v2 → v3: a second block (weeks 25–28) and the Grand Cup; training depth, goals, sponsors, Legacy snapshot.
  2: d => {
    const you = d.teams.flatMap(t => t.P).find(p => p.id === d.youId) || {};
    if (d.week > 24 && !d.cup) d.week = 25;
    if (d.cup) d.cup.id = d.cup.id || 'skyline';
    const L = Legacy.load();
    Object.assign(d, {
      legacy: d.legacy || L.owned.filter(id => !L.off.includes(id)),
      pure: false,
      mode: { hard: false, short: false },
      legend: null,
      cups: d.cups || [],
      lb: Object.fromEntries(STATK.map(k => [k, you[k] >= 90 ? 2 : you[k] >= 80 ? 1 : 0])),
      streak: null,
      injury: null,
      goal: null,
      sponsors: [],
      sponsorN: 0,
      focus: null,
      talk: null,
      trained: 0,
      hist: []
    });
    if (d.result) d.result.cups = d.result.cups || [{ id: 'skyline', place: d.result.place }];
    d.v = 3;
    return d;
  },
  // v3 → v4: per-player elements (assigned on load) and the Element Trial.
  3: d => {
    const you = d.teams.flatMap(t => t.P).find(p => p.id === d.youId);
    if (you) you.elSeen = ovr(you) >= 70;
    Object.assign(d, { elProof: false, elNext: 0 });
    d.v = 4;
    return d;
  }
};
const ROLE_NAME = { S: 'Setter', MB: 'Middle blocker', WS: 'Wing spiker' };
