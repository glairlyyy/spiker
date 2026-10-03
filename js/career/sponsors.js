// Sponsor deals (offered at fan milestones).

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
