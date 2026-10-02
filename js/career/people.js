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
  /** One NPC (or null). Someone who has left play (`gone`) comes back as a snapshot { id, name, role, gone } — no face, no team. */
  find(run, id) {
    const e = People.homes(run).get(id);
    if (e) return e.p;
    const me = run.people && run.people[id];
    return me && me.gone ? { id, name: me.gone.name, role: me.gone.role, gone: me.gone, team: null } : null;
  },
  /** Do you know their want / trait i? (found out through memories, or their club was scouted). */
  knows(run, p, what, i = 0) {
    const k = run.people && run.people[p.id] && run.people[p.id].known;
    if (!k) return false;
    if (what === 'trait') return !!k.traits[i];
    const ti = run.teams.indexOf(p.team);
    return !!k.want || (ti >= 0 && City.scouted(run, ti));
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
      if (run.people[id]) {
        const x = run.people[id];
        if (!x.known) x.known = { want: false, traits: [false, false] };
        if (!x.status) Object.assign(x, { status: 'active', bench: 0, gone: null });
        continue;
      }
      const want = People.pick(run, id, 'want', WANT_BY[home] || WANT_BY.academy),
        w = k => (TRAIT_BY_WANT[want] && TRAIT_BY_WANT[want][k]) || 1,
        pool = Object.fromEntries(Object.keys(TRAITS).map(k => [k, w(k)])),
        a = People.pick(run, id, 'trait0', pool);
      for (const pr of TRAIT_OPP) if (pr.includes(a)) pool[pr[0] === a ? pr[1] : pr[0]] = 0;
      pool[a] = 0;
      run.people[id] = {
        want,
        traits: [a, People.pick(run, id, 'trait1', pool)],
        known: { want: false, traits: [false, false] }, // what you have found out (Rel.reveal; scouting shows the want)
        status: 'active', // 'active' | 'cut' | 'quit' | 'poached' | 'abroad' | 'national' (T-064)
        bench: 0, // active: evaluations on the bench in a row; any other status: the week it happened
        gone: null, // { name, role, ovr, team, week, why }: a snapshot once they have left play (quit, abroad)
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
  /** Fates (spec §4.23 A; T-064). Evaluation weeks count the bench; paydays cut, quit and poach; the U21 champions are called up. Never during a cup. */
  benchTick(run) {
    for (const { p, t } of People.homes(run).values()) {
      const me = run.people[p.id];
      if (me.status !== 'active' || !run.teams.includes(t)) continue;
      me.bench = t.bench && t.bench.includes(p) ? me.bench + 1 : 0;
    }
  },
  /** The best same-role player of region r's reserves (any role if none), or null. */
  reserveFor(run, role, r) {
    const rt = run.reserve && run.reserve[r];
    if (!rt || !rt.P.length) return null;
    const same = rt.P.filter(q => q.role === role),
      pool = same.length ? same : rt.P;
    return pool.reduce((a, b) => (ovr(b) > ovr(a) ? b : a));
  },
  /** p (on a league team) trades seats with a reserve player of region r: p ends up in that reserve. False if there is none. */
  toReserve(run, p, r) {
    const q = People.reserveFor(run, p.role, r),
      t = p.team,
      rt = run.reserve[r];
    if (!q || !t) return false;
    const mine = Run.myTeam(run) === t,
      you = Run.you(run);
    World.swap(p, q);
    finalizeTeam(t);
    finalizeTeam(rt);
    if (mine) {
      delete you.bond[p.id];
      if (you.bond[q.id] == null) you.bond[q.id] = 0;
    }
    return true;
  },
  /** Take p out of play for good (a reserve player): removed from the squad, a snapshot kept on their person. */
  remove(run, p, why) {
    const t = p.team,
      me = run.people[p.id];
    me.gone = { name: p.name, role: p.role, ovr: ovr(p), team: t ? t.name : '', week: run.week, why };
    me.status = why;
    if (run.loans) delete run.loans[p.id]; // nobody to collect from, no more debt_unpaid
    if (t) {
      t.P.splice(t.P.indexOf(p), t.P.includes(p) ? 1 : 0);
      if (t.bench && t.bench.includes(p)) t.bench.splice(t.bench.indexOf(p), 1);
      if (t.P.length) finalizeTeam(t);
    }
  },
  /** They go: 'gloria' (St. Gloria's reserves, still in play) or 'abroad' (off the island). Returns the news line. */
  leave(run, id, to) {
    const p = People.homes(run).has(id) ? People.find(run, id) : null,
      me = run.people[id];
    if (!p || !me || me.status !== 'active') return '';
    const from = p.team ? p.team.name : '';
    if (to === 'gloria') {
      // the best reserve of their own faction takes the seat; they join St. Gloria's reserves (a seat swap if it has someone to trade)
      const own = (FACTIONS[p.team.i] && FACTIONS[p.team.i].region) || 'outlaws',
        gt = run.reserve.gloria;
      if (!gt || !People.toReserve(run, p, own)) return '';
      const rt = p.team;
      rt.P.splice(rt.P.indexOf(p), 1);
      if (rt.P.length) finalizeTeam(rt);
      gt.P.push(p);
      p.team = gt;
      if (gt.coachIQ == null) gt.coachIQ = 0.5; // (finalizeTeam would roll it with rnd(): the main stream)
      finalizeTeam(gt);
      me.status = 'poached';
      me.bench = run.week;
      return `${p.name} leaves ${from} for St. Gloria.`;
    }
    const region = (FACTIONS[p.team.i] && FACTIONS[p.team.i].region) || 'outlaws';
    if (!People.toReserve(run, p, region)) return '';
    People.remove(run, p, 'abroad');
    return `${p.name} has left the island (${from}).`;
  },
  /** Payday fates, after transfers / promotions. */
  fates(run) {
    if (Run.cupDef(run)) return;
    const F = REL.fate,
      you = Run.you(run),
      homes = People.homes(run);
    for (const { p, t } of homes.values()) {
      const me = run.people[p.id];
      if (me.status === 'cut' && run.teams.includes(t)) Object.assign(me, { status: 'active', bench: 0 }); // promoted back
    }
    // cut: benched `cut` evaluations in a row and under the faction's bar → swapped with its best reserve
    for (const { p, t } of [...homes.values()]) {
      const me = run.people[p.id],
        bar = FACTIONS[t.i] ? World.joinReq(run, t.i).ovr || 0 : 0,
        feud = !!t.cap && t.cap !== p && squadOf(t).includes(t.cap) && Rel.chem(run, t).foe[t.cap.id].has(p.id); // feuding with their captain: one evaluation sooner
      if (me.status !== 'active' || !run.teams.includes(t) || p === you || me.bench < F.cut - (feud ? 1 : 0) || ovr(p) >= bar) continue;
      const r = FACTIONS[t.i].region,
        q = People.reserveFor(run, p.role, r);
      if (!q || !People.toReserve(run, p, r)) continue;
      me.status = 'cut';
      me.bench = run.week;
      Run.news(run, `${p.name} is cut from ${t.name} and sent to the reserves.`);
      if (Rel.list(run, p.id).some(e => e.k === 'spot_taken')) Rel.add(run, p.id, 'spot_taken');
      if (q) Rel.addPair(run, p.id, q.id, 'spot_taken', null, p.id);
    }
    // quit: a cut player still in the reserves after `weeks`
    for (const { p } of [...People.homes(run).values()]) {
      const me = run.people[p.id];
      if (me.status !== 'cut' || run.week - me.bench < F.quit.weeks) continue;
      const m = (me.traits.includes('cynical') ? 1.5 : 1) * (me.traits.includes('loyal') ? 0.5 : 1);
      if (People.roll(run, p.id, `quit|${run.week}`) >= F.quit.p * m) continue;
      const first = p.name.split(' ')[0];
      People.remove(run, p, 'quit');
      Run.news(run, `${p.name} quit the sport.`);
      if (Rel.list(run, p.id).length) Run.log(run, `${first} quit. I can't say I didn't see it coming.`);
    }
    People.poach(run);
  },
  /** One poaching a payday: an active money / leave NPC in the top share of a faction's league players, by roll. */
  poach(run) {
    if (CUPS.some(c => c.after === run.week)) return; // the next week starts a cup: nobody changes squads under it
    const F = REL.fate.poach,
      you = Run.you(run),
      byRegion = {};
    for (const { p, t } of People.homes(run).values()) {
      const me = run.people[p.id];
      if (me.status === 'active' && run.teams.includes(t) && FACTIONS[t.i] && FACTIONS[t.i].region !== 'gloria')
        (byRegion[FACTIONS[t.i].region] = byRegion[FACTIONS[t.i].region] || []).push(p);
    }
    let best = null;
    for (const ps of Object.values(byRegion)) {
      const top = ps.sort((a, b) => ovr(b) - ovr(a) || (a.id < b.id ? -1 : 1)).slice(0, Math.ceil(ps.length * F.top));
      for (const p of top) {
        const me = run.people[p.id],
          r = People.roll(run, p.id, `poach|${run.week}`);
        if (p === you || !['money', 'leave'].includes(me.want) || r >= F.p) continue;
        if (!best || r < best.r) best = { p, r, me };
      }
    }
    if (!best) return;
    const to = best.me.want === 'money' ? 'gloria' : 'abroad';
    if (Rel.stance(run, best.p.id) >= REL.tags.respect) {
      // they ask you first: the question waits in the People drawer next week (an unanswered one lets them go)
      run.asks.push({ id: best.p.id, kind: 'poach_advice', week: run.week + 1, data: { to } });
      return;
    }
    const line = People.leave(run, best.p.id, to);
    if (line) Run.news(run, line);
  },
  /** The U21 champions' NPCs: the first REL.fate.national by OVR are called up (still in play). */
  national(run) {
    const c = run.cup && run.cup.entrants && run.cup.entrants[bracketChampion(run.cup.sched)];
    if (!c || !c.ids) return;
    const all = People.homes(run),
      ps = c.ids
        .map(id => (all.has(id) ? all.get(id).p : null))
        .filter(Boolean)
        .sort((a, b) => ovr(b) - ovr(a))
        .slice(0, REL.fate.national);
    for (const p of ps) {
      const me = run.people[p.id];
      if (me.status !== 'active' && me.status !== 'cut') continue;
      Object.assign(me, { status: 'national', bench: run.week });
      Run.news(run, `${p.name} is called up to the national team.`);
    }
  },
  /** The people who mattered most: the n largest |stance| among everyone with memories, with their fate and top 2 memories. */
  mattered(run, n = 5) {
    const ids = Object.keys(run.mem || {})
      .map(k => k.split('|').find(x => x !== run.youId))
      .filter(id => run.people && run.people[id]);
    return [...new Set(ids)]
      .map(id => ({ id, stance: Rel.stance(run, id) }))
      .sort((a, b) => Math.abs(b.stance) - Math.abs(a.stance) || (a.id < b.id ? -1 : 1))
      .slice(0, n)
      .map(({ id, stance }) => {
        const p = People.find(run, id),
          me = run.people[id];
        return {
          id,
          name: p ? p.name : 'Someone',
          role: p ? p.role : '',
          stance,
          tag: Rel.tag(run, id),
          fate: People.fateText(me),
          mem: Rel.top(run, id, 2)
        };
      });
  },
  /** Their fate in one line: status and week. */
  fateText(me) {
    const w = me.gone ? me.gone.week : me.bench;
    return (
      {
        cut: `cut to the reserves, W${w}`,
        quit: `quit the sport, W${w}`,
        poached: `poached by St. Gloria, W${w}`,
        abroad: `left the island, W${w}`,
        national: `called up to the national team, W${w}`
      }[me.status] || 'still in play'
    );
  },
  /**
   * NPC ↔ NPC memories (T-065), squadmates only: (1) two who trained at the same place this week → 'trained'; (2) a league team's starters
   * share an off-screen result (win share by team OVR vs the league mean) → won / lost_together, damped by REL.chem.result. Then the budget is
   * held (Rel.trim) and a clique that formed or a feud that started in a squad you have met becomes a Gazette rumour.
   */
  pairs(run, homes) {
    const sig = t => {
        const c = Rel.chem(run, t);
        return { cliques: c.cliques, feuds: c.feuds };
      },
      squads = [...new Set([...homes.values()].map(e => e.t))],
      before = new Map(squads.map(t => [t, sig(t)])),
      byAt = new Map();
    for (const { p, t } of homes.values()) {
      const pl = run.people[p.id].plan;
      if (!pl || (pl.act !== 'train' && pl.act !== 'hard') || !pl.at) continue;
      const k = `${squads.indexOf(t)}|${pl.at}`;
      if (!byAt.has(k)) byAt.set(k, []);
      byAt.get(k).push(p.id);
    }
    for (const ids of byAt.values())
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) Rel.addPair(run, ids[i], ids[j], 'trained');
    const mean = run.teams.reduce((a, t) => a + t.ovr, 0) / run.teams.length;
    run.teams.forEach((t, ti) => {
      const won = People.roll(run, `team${ti}`, 'result') < clamp(0.5 + (t.ovr - mean) / REL.chem.win, 0.15, 0.85),
        ids = t.P.filter(p => p.id !== run.youId && run.people[p.id] && run.people[p.id].inj === 0).map(p => p.id);
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++)
          Rel.addPair(
            run,
            ids[i],
            ids[j],
            won ? 'won_together' : 'lost_together',
            MEMORY[won ? 'won_together' : 'lost_together'].v * REL.chem.result
          );
    });
    Rel.trim(run);
    for (const t of squads) {
      if (!(t === Run.myTeam(run) || squadOf(t).some(p => run.met[p.id]))) continue;
      const was = before.get(t),
        now = sig(t),
        first = id => People.find(run, id).name.split(' ')[0],
        say = (kind, ids) => {
          const L = CHEM_TEXT[kind],
            f = ids.map(first);
          Run.news(
            run,
            L[Math.floor(hstr(`chem|${kind}|${run.week}|${ids.join()}`) * L.length)]
              .replace('{t}', t.name)
              .replace('{a}', f[0])
              .replace('{b}', f[1])
              .replace('{c}', f[2])
          );
        };
      for (const c of now.cliques) if (!was.cliques.some(w => w.some(id => c.includes(id)))) say('clique', c);
      for (const f of now.feuds) if (!was.feuds.some(w => w[0] === f[0] && w[1] === f[1])) say('feud', f);
    }
  },
  /** One week for every NPC: plan → apply → record; injuries, stamina, off-screen play for league starters. */
  week(run) {
    if (CALENDAR[run.week] === 'eval') People.benchTick(run);
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
    People.pairs(run, homes);
  }
};
