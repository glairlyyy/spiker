// NPC careers (spec §4.23 A, H): every league / pool / Academy / street-crew player (never you) has a want, two traits and
// a weekly plan, and grows from what the plan did (training XP, match XP) instead of a random weekly drift.
// No DOM. No R() / rnd() / pick(): every roll is `People.roll`, a string hash of the run's seed, the week, the player and a
// salt, so the NPC careers are deterministic per run and never move the main random stream.
// Weekly order (Growth.week): People.week → breakthrough rolls → finalizeTeam. Data and numbers: js/data/people.js.

const People = {
  /** [0, 1) from the run seed, the week, a player id and a salt. */
  roll: (run, id, salt) => hstr(`${run.pseed}|${run.week}|${id}|${salt}`),
  /** One weighted pick (one roll) from { key: weight }; zero weights are never picked. */
  pick(run, id, salt, weights) {
    const keys = Object.keys(weights).filter(k => weights[k] > 0);
    return hpick(keys, weights, People.roll(run, id, salt));
  },
  /** The seed of a run's NPC rolls: a hash of every league player's name. */
  seed: teams => hstr(teams.flatMap(t => squadOf(t).map(p => p.name)).join('|')),
  /** The squads NPCs live in, with their home: league teams (faction region), reserves (their key; the street crew → outlaws), the Academy squad. */
  homes(run) {
    const out = new Map(),
      add = (t, home) => {
        for (const p of squadOf(t)) if (p.id !== run.youId && !p.you && !out.has(p.id)) out.set(p.id, { p, home, t });
      };
    for (const t of run.teams) add(t, (FACTIONS[t.i] && FACTIONS[t.i].region) || 'outlaws');
    for (const [r, t] of Object.entries(run.reserve || {})) add(t, r === 'street' ? 'outlaws' : r);
    if (run.pickup) add(run.pickup, 'academy');
    return out;
  },
  /** Every NPC once (never you). */
  all: run => [...People.homes(run).values()].map(e => e.p),
  /** 'wei' | 'wu' | 'shu' | 'outlaws' | 'gloria' | 'academy' for an NPC. */
  home(run, p, homes = People.homes(run)) {
    const e = homes.get(p.id);
    return e ? e.home : 'academy';
  },
  /** Create the entries that are missing (new players from transfers, the street crew). */
  ensure(run, homes = People.homes(run)) {
    if (!run.people) run.people = {};
    for (const [id, { home }] of homes) {
      if (run.people[id]) continue;
      const want = People.pick(run, id, 'want', WANT_BY[home] || WANT_BY.academy),
        w = k => (TRAIT_BY_WANT[want] && TRAIT_BY_WANT[want][k]) || 1,
        pool = Object.fromEntries(Object.keys(TRAITS).map(k => [k, w(k)])),
        a = People.pick(run, id, 'trait0', pool);
      for (const pr of TRAIT_OPP) if (pr.includes(a)) pool[pr[0] === a ? pr[1] : pr[0]] = 0;
      pool[a] = 0;
      run.people[id] = {
        want,
        traits: [a, People.pick(run, id, 'trait1', pool)],
        plan: null,
        sta: 100,
        inj: 0,
        xp: {},
        log: { train: 0, hard: 0, rest: 0, hustle: 0, hurt: 0 }
      };
    }
  },
  /** True while an NPC is injured. */
  out: (run, p) => !!(run.people && run.people[p.id] && run.people[p.id].inj > 0),
  /** This week's plan: { act: 'out' | 'rest' | 'hustle' | 'train' | 'hard' | 'wit', stat, at (a SPOTS id or null) }. */
  plan(run, p, home = People.home(run, p)) {
    const me = run.people[p.id];
    if (me.inj > 0) return { act: 'out' };
    if (me.sta < PEOPLE.sta.tired) return { act: 'rest' };
    const w = { ...PLAN[me.want] };
    for (const t of me.traits) for (const [k, m] of Object.entries(PLAN_TRAIT[t] || {})) w[k] *= m;
    const act = People.pick(run, p.id, 'plan', w);
    if (act === 'rest' || act === 'hustle') return { act };
    const stat = act === 'weak' ? STATK.reduce((lo, k) => (p[k] < p[lo] ? k : lo), STATK[0]) : act === 'wit' ? 'wit' : KEYSTAT[p.role],
      region = home === 'academy' ? 'open' : home,
      at = Object.keys(SPOTS).find(id => SPOTS[id].train === stat && SPOTS[id].region === region) || null;
    return { act: act === 'hard' ? 'hard' : act === 'wit' ? 'wit' : 'train', stat, at };
  },
  /**
   * Give an NPC's stat XP through the same curve as yours (Training.need), up to `top`; the rest banks in person.xp.
   * Wit counts in 0.02 steps (level = wit × 50). Returns the points gained.
   */
  addXp(person, p, stat, xp, top) {
    let v = stat === 'wit' ? Math.round(p.wit * 50) : p[stat],
      have = (person.xp[stat] || 0) + xp,
      pts = 0;
    if (v >= top) return 0; // at (or above) this source's top: it banks nothing
    while (v < top && have >= Training.need(v)) {
      have -= Training.need(v);
      v++;
      pts++;
    }
    person.xp[stat] = v >= top ? 0 : have;
    if (stat === 'wit') p.wit = +clamp(p.wit + pts * 0.02, 0.1, CAREER.witRunCap).toFixed(2);
    else p[stat] = clamp(p[stat] + pts, STAT_FLOOR, 99);
    return pts;
  },
  /** Match XP (hustle, off-screen play): spread over the four stats like the old drift — key stat 0.4, the others 0.2 each — up to the run cap. */
  matchXp(person, p, xp) {
    for (const k of STATK) People.addXp(person, p, k, xp * (k === KEYSTAT[p.role] ? 0.4 : 0.2), CAREER.runCap);
  },
  /** One week for every NPC: plan → apply → record; injuries, stamina, off-screen play for league starters. */
  week(run) {
    const homes = People.homes(run),
      hard = run.mode && run.mode.hard ? 1.15 : 1,
      starters = new Set(run.teams.flatMap(t => t.P));
    People.ensure(run, homes);
    for (const { p, home, t } of homes.values()) {
      const me = run.people[p.id],
        plan = People.plan(run, p, home);
      me.plan = plan;
      if (plan.act === 'out') me.inj = Math.max(0, me.inj - 1);
      else if (plan.act === 'rest') {
        me.sta += PEOPLE.sta.rest;
        me.log.rest++;
      } else if (plan.act === 'hustle') {
        People.matchXp(me, p, PEOPLE.hustle);
        me.sta -= PEOPLE.sta.hustle;
        me.log.hustle++;
      } else {
        const isHard = plan.act === 'hard',
          q = plan.at ? City.quality(run, plan.at).q : REGIONS.open.q,
          top = plan.stat === 'wit' ? Math.round(CAREER.witRunCap * 50) : TRAIN_CAP;
        me.log[isHard ? 'hard' : 'train']++;
        for (let s = 0; s < PEOPLE.sessions; s++) {
          People.addXp(me, p, plan.stat, PEOPLE.xp * q * (p.pot || 1) * hard * (isHard ? PEOPLE.hard : 1), top);
          const low = me.sta < PEOPLE.hurt.lowSta;
          me.sta -= isHard ? PEOPLE.sta.hard : PEOPLE.sta.train;
          if (isHard && People.roll(run, p.id, `hurt${s}`) < (low ? PEOPLE.hurt.low : PEOPLE.hurt.hard)) {
            const [a, b] = PEOPLE.hurt.weeks;
            me.inj = a + Math.floor(People.roll(run, p.id, 'hurtw') * (b - a + 1));
            me.log.hurt++;
            Run.news(run, `${p.name} (${t.name}) is out — overtrained.`);
            break;
          }
        }
      }
      if (plan.act !== 'out' && me.inj === 0 && starters.has(p)) People.matchXp(me, p, PEOPLE.play);
      me.sta = clamp(me.sta + PEOPLE.sta.week, 0, 100);
    }
  }
};
