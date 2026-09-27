// Coach's goals (one per block of the season) and sponsor deals (offered at fan milestones).

const Goals = {
  /** Block that contains this week: [first week, last week]. */
  block(week) {
    const end = BLOCKS.find(b => week <= b) || BLOCKS[BLOCKS.length - 1],
      i = BLOCKS.indexOf(end);
    return [i ? BLOCKS[i - 1] + 1 : 1, end];
  },
  /** At the start of a block (or of the run), the coach sets a goal to reach by the block's last week. */
  set(run) {
    if (run.goal && run.goal.by >= run.week) return;
    const [, by] = Goals.block(run.week),
      you = Run.you(run),
      key = KEYSTAT[you.role],
      prev = run.goal && run.goal.kind;
    // the coach picks from what makes sense this block
    const stat = STATK.includes(key) && you[key] < Training.gate(run, key) - 2 ? key : STATK.find(k => you[k] < Training.gate(run, k) - 2);
    const warm = Object.keys(CALENDAR)
      .map(Number)
      .find(w => w >= run.week && w <= by && CALENDAR[w].startsWith('warmup'));
    const low = Run.mates(run).reduce((a, m) => ((you.bond[m.id] || 0) < (you.bond[a.id] || 0) ? m : a), Run.mates(run)[0]);
    const opts = [];
    if (stat)
      opts.push({
        kind: 'stat',
        stat,
        target: Math.min(Training.gate(run, stat), you[stat] + Math.max(4, Math.round((by - run.week + 1) * 1.6)))
      });
    if (warm) opts.push({ kind: 'win', week: warm });
    opts.push({ kind: 'fans', target: Math.ceil((run.fans + 500 + (by - run.week) * 50) / 100) * 100 });
    if (low && (you.bond[low.id] || 0) < 60) opts.push({ kind: 'bond', mate: low.id, target: Math.min(100, (you.bond[low.id] || 0) + 18) });
    const pool = opts.filter(o => o.kind !== prev);
    run.goal = { ...pick(pool.length ? pool : opts), by, done: null };
    Run.log(run, `Coach's goal: ${Goals.text(run, run.goal)} by week ${by}.`);
  },
  text(run, g) {
    if (!g) return '';
    if (g.kind === 'stat') return `${STATNAME[g.stat]} ${g.target}`;
    if (g.kind === 'win') return `win the week-${g.week} warm-up`;
    if (g.kind === 'fans') return `${g.target.toLocaleString()} fans`;
    const m = Run.myTeam(run).P.find(p => p.id === g.mate);
    return `bond ${g.target} with ${m ? m.name : 'a teammate'}`;
  },
  met(run, g) {
    const you = Run.you(run);
    if (g.kind === 'stat') return you[g.stat] >= g.target;
    if (g.kind === 'win') return run.warm.some(w => w.week === g.week && w.win);
    if (g.kind === 'fans') return run.fans >= g.target;
    return (you.bond[g.mate] || 0) >= g.target;
  },
  /** End of the goal's week: reward or a small mood hit. */
  check(run) {
    const g = run.goal;
    if (!g || g.done != null || run.week < g.by) return;
    g.done = Goals.met(run, g);
    if (g.done) {
      const out = [Run.bump(run, 'sp', GOAL_REWARD.sp), Run.bump(run, 'fans', GOAL_REWARD.fans), Run.bump(run, 'mood', 1)];
      Run.log(run, `Goal reached (${Goals.text(run, g)}): ${out.filter(Boolean).join(', ')}`);
    } else Run.log(run, `Goal missed (${Goals.text(run, g)}): ${Run.bump(run, 'mood', -1) || 'coach is disappointed'}`);
  }
};

const Sponsors = {
  active: (run, id) => (run.sponsors || []).some(s => s.id === id && s.state !== 'lost'),
  /** Training bonus from sponsor perks. */
  trainBonus: (run, key) =>
    (Sponsors.active(run, 'shoes') && (key === 'speed' || key === 'jump') ? 0.1 : 0) +
    (Sponsors.active(run, 'iron') && (key === 'power' || key === 'def') ? 0.1 : 0),
  fanMul: run => (Sponsors.active(run, 'spike') ? 1.2 : 1),
  /** At a fan milestone, two sponsors make an offer (an event shown before the week's choice). */
  offer(run) {
    if (run.event || Run.cupDef(run) || run.sponsorN >= SPONSOR_AT.length || run.fans < SPONSOR_AT[run.sponsorN]) return;
    const free = Object.keys(SPONSORS).filter(id => !run.sponsors.some(s => s.id === id));
    if (free.length < 1) return;
    run.sponsorN++;
    const a = pick(free),
      b = pick(free.filter(x => x !== a)) || null;
    run.event = { id: 'sponsor', opts: [a, b].filter(Boolean), pre: true };
  },
  /** Sign sponsor `id`: the perk starts now, the condition is checked over the coming weeks / next match. */
  sign(run, id) {
    const d = SPONSORS[id];
    run.sponsors.push({ id, state: 'pending', weeks: d.weeks || 0, cnt: 0 });
    if (id === 'aqua') {
      run.staMax += 15;
      run.sta += 15;
    }
    return `Signed with ${d.name}: ${d.perk}. Condition: ${d.cond.toLowerCase()}.`;
  },
  lose(run, s) {
    s.state = 'lost';
    if (s.id === 'aqua') {
      run.staMax -= 15;
      run.sta = Math.min(run.sta, run.staMax);
    }
    Run.log(run, `${SPONSORS[s.id].name} pulled out — condition not met (${SPONSORS[s.id].perk} lost).`);
  },
  keep(run, s) {
    s.state = 'kept';
    Run.log(run, `${SPONSORS[s.id].name} is happy — the deal is yours for the season.`);
  },
  /** End of a week: mood and training conditions count down. */
  tick(run) {
    for (const s of run.sponsors || []) {
      if (s.state !== 'pending') continue;
      const k = SPONSORS[s.id].kind;
      if (k === 'mood') {
        if (run.mood < 2) Sponsors.lose(run, s);
        else if (--s.weeks <= 0) Sponsors.keep(run, s);
      } else if (k === 'train') {
        s.cnt += run.trained ? 1 : 0;
        if (--s.weeks <= 0) s.cnt >= 3 ? Sponsors.keep(run, s) : Sponsors.lose(run, s);
      }
    }
  },
  /** After one of your matches: win / grade conditions. */
  match(run, win, grade) {
    for (const s of run.sponsors || []) {
      if (s.state !== 'pending') continue;
      const k = SPONSORS[s.id].kind;
      if (k === 'win') win ? Sponsors.keep(run, s) : Sponsors.lose(run, s);
      else if (k === 'grade') grade === 'S' || grade === 'A' ? Sponsors.keep(run, s) : Sponsors.lose(run, s);
    }
  }
};
