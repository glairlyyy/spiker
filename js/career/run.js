// Career run: the run object, creating your player, joining a team, stat changes, week flow, save/resume.
// No DOM here — the career UI calls these and re-renders.

/** The active run (or null). */
let RUN = null;

const Run = {
  /** Teams for a new run (the league generator) plus a pre-rolled team for the player. */
  draft() {
    const teams = mkLeagueTeams();
    for (const t of teams) for (const p of squadOf(t)) p.pot = +rnd(GROWTH.pot[0], GROWTH.pot[1]).toFixed(2);
    // the island's clubs: each league team plays as its faction's squad
    for (const t of teams) if (FACTIONS[t.i] && FACTIONS[t.i].team) [t.name, t.short, t.color] = FACTIONS[t.i].team;
    const used = new Set(teams.flatMap(t => squadOf(t).map(p => p.name)));
    const reserve = Pool.build(teams, used);
    for (const t of [...teams, ...Object.values(reserve)]) Run.lower(t);
    return { teams, team: Math.floor(R() * teams.length), reserve };
  },
  /** A generated squad at the run's start level (CAREER.npcStart): each player's OVR mapped onto 40–50, stats shifted together (no draws). */
  lower(t) {
    const { from, to } = CAREER.npcStart;
    for (const p of squadOf(t)) {
      if (p.named) continue;
      const target = Math.round(to[0] + ((clamp(ovr(p), from[0], from[1]) - from[0]) / (from[1] - from[0])) * (to[1] - to[0]));
      for (let it = 0; it < 4; it++) {
        const d = target - ovr(p);
        if (!d) break;
        for (const k of STATK) p[k] = Math.round(clamp(p[k] + d, 10, 99));
      }
    }
    if (t.P && t.P.length) t.ovr = teamOvr(t); // (the rating only: no captain / number / leadership re-roll)
  },
  /**
   * Start a run. spec = { role, name, mode? ({hard, short, story}; story defaults to true) } (every stat starts at CAREER.start, wit at CAREER.witBase: spec §4.22).
   * You always start as a free agent: your player takes the same-role slot on the Academy squad (the pickup squad).
   */
  create(draft, spec) {
    const mode = spec.mode || {};
    const teams = draft.teams,
      reserve = draft.reserve || Pool.build(teams, new Set(teams.flatMap(x => squadOf(x).map(p => p.name)))),
      pickup = World.pickup(new Set(teams.concat(Object.values(reserve)).flatMap(x => squadOf(x).map(p => p.name)))),
      t = (Run.lower(pickup), pickup),
      role = spec.role,
      slot = role === 'S' ? 'S' : role === 'MB' ? 'MB' : 'W0',
      old = t.P.find(p => p.slot === slot),
      stats = {};
    for (const k of STATK) stats[k] = CAREER.start;
    const you = createPlayer({
      name: spec.name,
      role,
      slot,
      wit: CAREER.witBase,
      hair: pick(HAIR),
      look: mkLook(role),
      move: pick(MOVES[role]),
      bmove: pick(BMOVES),
      team: t,
      num: old.num,
      lead: Math.round(rnd(30, 60)),
      ego: 'selfish', // the new kid who wants to be the star (spec §2.12 personality)
      you: true,
      skills: [],
      bond: {},
      ...stats
    });
    t.P[t.P.indexOf(old)] = you;
    [t.s, t.mb] = t.P;
    t.ws = [t.P[2], t.P[3]];
    for (const m of squadOf(t)) if (m !== you) you.bond[m.id] = 0;
    finalizeTeam(t);
    // Hard league: everyone else starts stronger and grows faster
    if (mode.hard)
      for (const T of teams) {
        for (const p of squadOf(T))
          if (p !== you) {
            for (const k of STATK) p[k] = Math.min(99, p[k] + 5);
            p.pot = +((p.pot || 1) + 0.25).toFixed(2);
          }
        finalizeTeam(T);
      }
    if (mode.hard)
      for (const T of Object.values(reserve)) {
        for (const p of T.P) {
          for (const k of STATK) p[k] = Math.min(99, p[k] + 5);
          p.pot = +((p.pot || 1) + 0.25).toFixed(2);
        }
        if (T.P.length) finalizeTeam(T);
      }
    const run = {
      ...Run.defaults(),
      v: RUN_VERSION,
      week: mode.short ? 5 : 1,
      teams,
      team: null,
      youId: you.id,
      sta: CAREER.staMax,
      event: null,
      cup: null,
      lastMain: KEYSTAT[role],
      result: null,
      // modes, cup record, training depth, sponsors, history
      mode: { hard: !!mode.hard, short: !!mode.short, story: mode.story !== false },
      streak: null,
      injury: null,
      sponsorN: 0,
      focus: null,
      talk: null,
      elProof: false, // the Element Trial: S grade in the zone done?
      // free agency (pickup squad until you sign), money, housing, league news and the Gazette
      pickup,
      eval: null, // this week's evaluation draw (see js/career/eval.js)
      academy: true, // Academy squad member; false after leaving it (no way back)
      // faction pools: generated players outside the league teams (see js/career/pool.js)
      reserve,
      gazette: null,
      clash: null, // this week's street battle
      spotQ: {},
      pseed: People.seed(teams), // the seed of the NPC rolls (People.roll)
      fog: [CITY.airport.slice()], // the points you've stood on (the map is dark elsewhere)
      story: { seen: {}, flags: {}, cur: null } // story scenes (spec §10.10, js/career/story.js)
    };
    Run.log(run, `${you.name} arrives in the city as a free agent (${ROLE_NAME[role].toLowerCase()}) — find a club that will take you.`);
    Stars.seat(run); // the rival, the cohort and the first aces (spec §4.29; no randoms)
    People.ensure(run); // every NPC gets a want, traits and a plan slot (spec §4.23 A)
    for (const p of Stars.all(run)) run.people[p.id].want = 'national'; // the named all want the national team
    City.roll(run); // the island's places: which premium ones are overhyped, which rough ones are gems
    Training.rollFloor(run);
    Run.snap(run);
    Story.fire(run, 'start'); // Story mode: the intro scene (dark cold open, the walk home)
    Story.joined(run, 'academy'); // …then the Academy squad introduces itself at the first hub
    return run;
  },
  /** The cup being played right now (or null between cups). */
  cupDef: run => (run.cup && !run.cup.done ? CUPS.find(c => c.id === run.cup.id) : null),
  /** Weekly snapshot for the growth chart on the result screen. */
  snap(run) {
    const you = Run.you(run);
    run.hist.push({ w: run.week, ovr: ovr(you), ...Object.fromEntries(STATK.map(k => [k, you[k]])), wit: you.wit });
  },
  /** Match-day form before any team talk: your mood; a teammate's is +0.1 per 80+ bond (same for everyone on your side). */
  form(run, p) {
    const you = Run.you(run);
    return p === you ? MOODS[run.mood].form : 0.1 * Run.mates(run).filter(m => (you.bond[m.id] || 0) >= 80).length;
  },
  /**
   * The coach's 4 (see BENCH): per court slot [S, MB, WS, WS] the best same-role player of squad T by ovr + 6 × form (+ your
   * standing with `region` ÷ BENCH.standingPer for you); a missing role falls back to the best remaining, the rest sit.
   * Unless `dry`, reorders T.P / T.bench, slots, s / mb / ws and the captain (best leader on court). Returns
   * { starts, you: your score, rival: { p, score } | null } — the same-role player ahead of you (or the best sub behind).
   * `forceYou` (the Story cup, T-067): you take your role's first seat whatever the scores (an injured you still sits).
   */
  lineup(run, T, region, dry, forceYou) {
    const you = Run.you(run),
      cap = T.cap && squadOf(T).includes(T.cap) ? T.cap : null, // the sitting captain's allies gain, his enemies lose (REL.chem.capVouch)
      chem = cap ? Rel.chem(run, T) : null,
      score = p =>
        ovr(p) +
        6 * Run.form(run, p) +
        (p === you && region ? City.rep(run, region) / BENCH.standingPer : 0) +
        (chem ? Rel.capBonus(run, chem, cap, p) : 0),
      left = [...squadOf(T)],
      P = [],
      out = p => (run.injury && p === you) || People.out(run, p) || Asks.sits(run, p), // an injured player (you or an NPC, spec §4.23 A) or one who gave up the seat this week never starts
      forced = forceYou && !out(you) && left.includes(you);
    for (const role of ['S', 'MB', 'WS', 'WS']) {
      const fit = left.filter(p => !out(p)),
        ok = fit.length ? fit : left, // (everyone hurt: the coach starts someone anyway)
        of = ok.filter(p => p.role === role),
        p = forced && role === you.role && left.includes(you) ? you : (of.length ? of : ok).reduce((a, b) => (score(b) > score(a) ? b : a));
      P.push(p);
      left.splice(left.indexOf(p), 1);
    }
    const starts = P.includes(you),
      peers = (starts ? left : P).filter(p => p.role === you.role && p !== you),
      rival = peers.length ? peers.reduce((a, b) => (score(b) > score(a) ? b : a)) : null;
    if (!dry) {
      T.P = P;
      T.bench = left;
      P.forEach((p, i) => (p.slot = ['S', 'MB', 'W0', 'W1'][i]));
      [T.s, T.mb] = P;
      T.ws = [P[2], P[3]];
      for (const p of squadOf(T)) p.cap = false;
      T.cap = P.reduce((a, p) => (p.lead > a.lead ? p : a), P[0]);
      T.cap.cap = true;
      T.ovr = teamOvr(T);
    }
    return { starts, you: score(you), rival: rival && { p: rival, score: score(rival) } };
  },
  /** The absolute day of the run (week × days a week + days used this week): the clock for fatigue between fights. */
  dayNo: run => run.week * WEEK_DAYS + (WEEK_DAYS - City.days(run)),
  /** Your team: a league club, or the pickup squad while you're a free agent (run.team null). */
  myTeam: run => (run.team == null ? run.pickup : run.teams[run.team]),
  /** League news for the next Gazette. */
  news(run, text) {
    (run.news || (run.news = [])).push(text);
  },
  you: run => squadOf(Run.myTeam(run)).find(p => p.id === run.youId),
  /** Your teammates: none once you have left the Academy squad while still a free agent. */
  mates: run => (World.isFree(run) && run.academy === false ? [] : squadOf(Run.myTeam(run)).filter(p => p.id !== run.youId)),
  /** What this week is: 'train' | 'camp' | 'eval' (an evaluation you take part in) | 'cup'. */
  weekType(run) {
    if (Run.cupDef(run)) return 'cup';
    const k = CALENDAR[run.week] || 'train';
    return k === 'eval' ? (Eval.kind(run) ? 'eval' : 'train') : k;
  },
  /** A diary line. k: 'bad' | 'good' | 'world' — the Week report's tag (T-203); lines without one are tagged by text (logTag). */
  log(run, text, k) {
    const c = Run.cupDef(run);
    run.log.unshift(k ? { w: c ? c.short : run.week, t: text, k } : { w: c ? c.short : run.week, t: text });
    run.log.length = Math.min(run.log.length, 50);
  },
  /**
   * Change one of your values, respecting caps. key: a stat, 'wit', 'lead', 'sta', 'mood', 'sp', 'fans'.
   * Returns a short label such as "+6 Power" (empty if nothing changed).
   */
  bump(run, key, v) {
    const you = Run.you(run);
    const fmt = (d, name, dec = 0) => (d ? `${fmtDelta(d, { dec })} ${name}` : '');
    if (STATK.includes(key) || key === 'lead') {
      if (v > 0 && key !== 'lead') v = Math.max(1, Math.round(v * Training.dim(you[key]))); // events obey diminishing returns too
      const top = key === 'lead' ? CAREER.runCap : Math.max(you[key], TRAIN_CAP), // events stop at the training cap (never lower a stat matches raised)
        nv = Math.round(clamp(you[key] + v, CAREER.statMin, top)),
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
  /** A teammate remembers something (Rel.add). Returns a short label such as "+7 bond with Aoi". */
  bond(run, mateId, v, kind = 'event') {
    const m = squadOf(Run.myTeam(run)).find(p => p.id === mateId);
    if (!m) return ''; // that teammate is gone (you changed club, or they were transferred)
    const d = Rel.add(run, mateId, kind, v);
    return d ? `${fmtDelta(d)} bond with ${m.name}` : '';
  },
  /** The player may end a training week (not with an event open, not on a match week). */
  canEndWeek: run => !run.event && Run.weekType(run) !== 'cup' && Run.weekType(run) !== 'eval',
  /** Mark the Gazette read; true if it was unread. */
  readGazette(run) {
    if (!run.gazette || run.gazette.read) return false;
    run.gazette.read = true;
    return true;
  },
  /**
   * Close the week: the league grinds, sponsor deals are checked, an injury heals a little;
   * then the next week (or a cup, after week 24 and week 28) begins.
   */
  endWeek(run) {
    for (const step of WEEK_END) step(run);
    run.trained = 0;
    run.days = WEEK_DAYS;
    run.dayLog = [];
    run.clash = null;
    Run.snap(run);
    run.week++;
    const cup = CUPS.find(c => c.after === run.week - 1);
    if (cup) Cup.start(run, cup);
    else Run.nextWeek(run);
    Run.save(run);
  },
  /** A training week begins: who's at which training, sponsor offers. */
  nextWeek(run) {
    for (const step of WEEK_START) step(run);
  },
  /** An injury heals a week. */
  heal(run) {
    if (run.injury && --run.injury.weeks <= 0) {
      run.injury = null;
      Run.log(run, 'Fully recovered from the injury.');
    }
  },
  /** An open street battle nobody fought is settled at week end. */
  settleClash(run) {
    if (Fight.clashSite(run)) Run.log(run, Fight.clashEnd(run));
  },
  /** Save the run (teams in their compact JSON form). */
  save(run) {
    store.setJSON(
      KEYS.career,
      Object.assign({}, run, {
        teams: run.teams.map(teamToJSON),
        pickup: run.pickup ? teamToJSON(run.pickup) : null,
        reserve: Object.fromEntries(Object.entries(run.reserve || {}).map(([r, t]) => [r, teamToJSON(t)]))
      })
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
      const run = Object.assign(d, {
        teams: d.teams.map(teamFromJSON),
        pickup: d.pickup ? teamFromJSON(d.pickup) : null,
        reserve: Object.fromEntries(Object.entries(d.reserve || {}).map(([r, t]) => [r, teamFromJSON(t)]))
      });
      if (!Run.myTeam(run) || !Run.you(run)) return null; // corrupt save: your player is missing
      for (const t of run.teams.concat(run.pickup || [], Object.values(run.reserve))) for (const p of squadOf(t)) ensureEgo(p); // saves from before ego
      Run.repair(run);
      People.ensure(run); // players added since the last save (transfers, the street crew) get a career
      elAll(run.teams); // players from older saves get their element
      return run;
    } catch (e) {
      return null;
    }
  },
  /** A fresh copy of every plain-default run field (RUN_DEFAULTS). */
  defaults: () => Object.fromEntries(Object.entries(RUN_DEFAULTS).map(([k, [make]]) => [k, make()])),
  /** Fill what a save lacks or holds broken: every RUN_DEFAULTS field, then the fields that need the run itself. */
  repair(run) {
    for (const [k, [make, ok]] of Object.entries(RUN_DEFAULTS)) if (!ok(run[k])) run[k] = make();
    if (run.grades.length > MLOG.max) run.grades = run.grades.slice(-MLOG.max);
    if (typeof run.academy !== 'boolean') run.academy = World.isFree(run);
    if (run.eval && run.eval.week !== run.week) run.eval = null;
    Eval.setup(run);
    if (!run.spotQ || typeof run.spotQ !== 'object' || !Object.keys(run.spotQ).length) City.roll(run);
    if (!Array.isArray(run.fog)) run.fog = [run.pos.slice()];
    if (run.clash && !Hex.tile(run.clash.tile)) run.clash = null;
    if (!Number.isFinite(run.sta)) run.sta = run.staMax;
    if (!run.mode || typeof run.mode !== 'object') run.mode = { hard: false, short: false, story: true };
    if (typeof run.mode.story !== 'boolean') run.mode.story = true;
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
const RUN_VERSION = 18;
/** version → upgrade step (none yet; v2: faction reserves, v3: cup entrants, v4: squads of 6 (teams save `bench`, bigger pools), v5: Limit Break removed (`run.lb` gone), v6: `run.met` / `run.street` / `run.refused` (rankings, challenges), v7: `run.losses` / `run.lastFight` (loss and injury), v8: `run.mlog` (match history), v9: `run.mode.story` (T-067), v10: `run.people` / `run.pseed` (NPC careers, T-060), v11: `run.mem` (what NPCs remember about you, T-061), v12: `run.asks` / `run.loans` / `run.vouch` / `run.sitout` / `run.duo` (approaches, T-063), v13: person `status` / `bench` / `gone` (fates, T-064), v14: memory entries gain `a` + NPC ↔ NPC pairs in `run.mem` (T-065), v15: `run.warm` → `run.evals`, `warmupWin|Loss` → `evalWin|Loss` (T-086) — older saves are dropped; add steps when the saved shape changes). */
const RUN_MIGRATIONS = {};
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
/**
 * Run fields with a plain default: name → [make (fresh value), valid (keep a saved value?)]. `Run.create` starts from
 * these and `Run.repair` refills any that a save lacks or holds broken — add a new simple field here, not in both.
 */
const RUN_DEFAULTS = {
  log: [() => [], Array.isArray],
  seen: [() => [], Array.isArray],
  evals: [() => [], Array.isArray], // evaluation results { week, win }
  cups: [() => [], Array.isArray],
  sponsors: [() => [], Array.isArray],
  hist: [() => [], Array.isArray],
  mlog: [() => [], Array.isArray], // match history (Cup.record): plain entries, newest last
  grades: [() => [], Array.isArray], // your match grades, newest last (capped like mlog)
  news: [() => [], Array.isArray],
  sp: [() => 0, Number.isFinite],
  fans: [() => 0, Number.isFinite],
  trained: [() => 0, Number.isFinite],
  elNext: [() => 0, Number.isFinite], // next Element Trial offer week
  money: [() => ECON.start, Number.isFinite],
  staMax: [() => CAREER.staMax, v => Number.isFinite(v) && v > 0],
  mood: [() => 2, v => Number.isInteger(v) && !!MOODS[v]],
  housing: [() => 'studio', v => !!HOUSING[v]],
  reserve: [() => ({}), isObj], // faction pools (js/career/pool.js)
  people: [() => ({}), isObj], // NPC careers: player id → { want, traits, plan, sta, inj, xp, log } (js/career/people.js)
  pseed: [() => 0, Number.isFinite], // seed of the NPC rolls
  asks: [() => [], Array.isArray], // approaches waiting (and your own asks this week): js/career/asks.js
  loans: [() => ({}), isObj], // NPC id → { amt, due }: money you lent
  vouch: [() => ({}), isObj], // club index → true: an ally vouched for you (World.joinReq)
  sitout: [() => null, v => v === null || isObj(v)], // { week, sit: 'you' | id }: a seat given or asked for, that week's match only
  duo: [() => null, v => v === null || isObj(v)], // { id, week }: a mate fights your next challenge with you
  mem: [() => ({}), isObj], // what NPCs remember about you: pair key → [{ w, k, v, n }] (js/career/rel.js)
  met: [() => ({}), isObj], // player id → true: faced on court (their rating is known)
  street: [() => ({}), isObj], // player id → street points (Rank)
  refused: [() => ({}), isObj], // club index → { week, n }: team challenges it refused
  losses: [() => ({}), isObj], // region → team challenges lost this run
  rep: [() => ({}), isObj], // standing with each region's clubs
  own: [() => ({}), isObj], // seized border places → the region holding them
  hex: [() => ({ own: {}, p: {}, by: {}, t: {} }), isObj], // hex territory (spec §4.27, js/career/hex.js): changed owners, pressure, who pushes, last fought
  scout: [() => ({}), isObj], // scouted clubs: team index → week
  uses: [() => ({}), isObj],
  floor: [() => ({}), isObj],
  xp: [() => ({}), isObj], // training experience toward each stat's next point
  plays: [() => ({ k: 0, blk: 0, ace: 0 }), isObj],
  lastFight: [() => null, v => v === null || Number.isFinite(v)], // absolute day of your last challenge / street fight
  days: [() => WEEK_DAYS, v => Number.isFinite(v) && v >= 0 && v <= WEEK_DAYS], // days left this week
  dayLog: [() => [], Array.isArray], // what each spent day of this week was (the hub's day track, spec §10.2)
  pos: [() => CITY.airport.slice(), Array.isArray], // where you stand on the map
  story: [() => ({ seen: { intro: true }, flags: {}, cur: null }), isObj], // story scenes; a run saved before them skips the intro
  fav: [() => [], Array.isArray] // starred people (ids as strings): pinned in the People list, display only (spec §10.9)
};
/** Run rank letter for a fan count (RANKS is ordered from the top rank down). */
const rankOf = fans => RANKS.find(([, min]) => fans >= min)[0];
/**
 * The week's steps, in order (each `run => void`; the order is the draw order — never reorder, only append).
 * A new weekly system adds one line here. Entries call through so every callee can load later than this file.
 */
const WEEK_END = [
  run => Growth.week(run),
  run => Sponsors.tick(run),
  run => Run.heal(run),
  run => World.week(run),
  run => Run.settleClash(run),
  run => Hex.decay(run)
];
const WEEK_START = [
  run => Fight.clashRoll(run),
  run => Training.rollFloor(run),
  run => Sponsors.offer(run),
  run => ElTrial.offer(run),
  run => Eval.setup(run),
  run => Asks.roll(run)
];
