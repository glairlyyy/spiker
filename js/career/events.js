// Random events: roll after a week's choice, then apply the chosen effects.

const EVENT_NEED = {
  notCap: run => !Run.you(run).cap,
  isCap: run => !!Run.you(run).cap,
  star: run => !!Run.you(run).star,
  tired: run => run.sta < 45,
  low: run => run.mood <= 1,
  late: run => run.week >= 13,
  early: run => run.week <= 8
};
const Events = {
  /** Maybe start an event (sets run.event). Each event happens at most once per run. */
  roll(run) {
    if (run.event) return run.event; // a Limit Break trial (or another special event) is already waiting
    if (R() >= CAREER.eventChance) return null;
    const pool = EVENTS.filter(e => !run.seen.includes(e.id) && (!e.need || EVENT_NEED[e.need](run)));
    if (!pool.length) return null;
    const e = pick(pool);
    run.seen.push(e.id);
    run.event = { id: e.id, mate: pick(Run.mates(run)).id };
    return run.event;
  },
  /** Event definition. Special events: 'limit' (Limit Break trial), 'element' (Element Trial), 'sponsor' (offer at a fan milestone). */
  def(ev, run) {
    if (ev.id === 'limit')
      return {
        title: `Limit Break: ${STATNAME[ev.stat]}`,
        text: `Your ${STATNAME[ev.stat].toLowerCase()} has hit its ceiling. Coach offers a trial to break through.`,
        a: ['Take the trial', `${run ? Math.round(Training.trialP(run) * 100) : '?'}% chance: ${STATNAME[ev.stat]} can grow past ${run ? Training.gate(run, ev.stat) : '—'} (+3); fail: −15 stamina, mood down`],
        b: ['Not yet', 'The trial comes back next time you reach the ceiling']
      };
    if (ev.id === 'element') {
      const you = run ? Run.you(run) : null;
      return {
        title: `${you ? ENAME[you.el] : 'Element'} awakening`,
        text: you ? `Coach takes you aside: “${you.sig.name} is in you. Show me.” Pass and your element is yours for good — its gauge fills in matches, and a full gauge or a captain's buff turns your next attack into ${you.sig.name}.` : '',
        a: ['Take the trial', `${run ? Math.round(ElTrial.chance(run) * 100) : '?'}% chance (mood, stamina, wit): unlock ${ENAME[you ? you.el : 'fire']}; fail: −20 stamina, mood down, retry in ${ElTrial.retry} weeks`],
        b: ['Not yet', 'The trial returns next week']
      };
    }
    if (ev.id === 'sponsor') {
      const o = ev.opts.map(id => SPONSORS[id]);
      return {
        title: 'Sponsor offer',
        text: `Your following has caught some attention — ${o.map(x => x.name).join(' and ')} want${o.length > 1 ? '' : 's'} to sign you.`,
        a: [`Sign ${o[0].name}`, `${o[0].perk}. Condition: ${o[0].cond.toLowerCase()}`],
        b: o[1] ? [`Sign ${o[1].name}`, `${o[1].perk}. Condition: ${o[1].cond.toLowerCase()}`] : ['Decline', 'No deal']
      };
    }
    return EVENTS.find(e => e.id === ev.id);
  },
  /** Fill {mate} and {cap}. */
  text(run, ev, s) {
    const T = Run.myTeam(run),
      mate = T.P.find(p => p.id === ev.mate);
    return s.replace('{mate}', mate ? mate.name : 'A teammate').replace('{cap}', T.cap.name);
  },
  /** Apply choice 0 (a) or 1 (b); clears the event and returns the log line. */
  choose(run, i) {
    const ev = run.event;
    if (ev.id === 'limit') {
      run.event = null;
      return i ? `Limit Break: not yet — ${STATNAME[ev.stat]} stays at ${Training.gate(run, ev.stat)}` : Training.trial(run, ev.stat);
    }
    if (ev.id === 'element') {
      run.event = null;
      return i ? ElTrial.wait(run) : ElTrial.take(run);
    }
    if (ev.id === 'sponsor') {
      run.event = null;
      const id = ev.opts[i];
      return id ? Sponsors.sign(run, id) : 'Declined the sponsor offers.';
    }
    const e = Events.def(ev),
      [label, fx] = i ? e.b : e.a;
    const out = Events.apply(run, ev, fx);
    run.event = null;
    return `${e.title} — ${label}: ${out.filter(Boolean).join(', ') || 'nothing happened'}`;
  },
  apply(run, ev, fx) {
    const out = [],
      T = Run.myTeam(run);
    for (const f of fx) {
      const [k, v] = f;
      if (k === 'chance') {
        if (R() < v) out.push(...Events.apply(run, ev, f[2]));
      } else if (k === 'main') out.push(Run.bump(run, run.lastMain, run.lastMain === 'wit' ? v / 100 : v));
      else if (k === 'bondMate') out.push(Run.bond(run, ev.mate, v));
      else if (k === 'bondCap') out.push(Run.bond(run, T.cap.id === run.youId ? ev.mate : T.cap.id, v));
      else if (k === 'bondAll') for (const m of Run.mates(run)) out.push(Run.bond(run, m.id, v));
      else out.push(Run.bump(run, k, v));
    }
    return out;
  }
};
