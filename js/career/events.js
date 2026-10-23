// Event cards: the Element Trial, sponsor offers, the gift chance (spec §4.35) and a friend who follows (§4.36) (the random training events are gone, owner 2026-10-05).

const Events = {
  /** Event definition. Special events: 'element' (Element Trial), 'sponsor' (offer at a fan milestone). */
  def(ev, run) {
    if (ev.id === 'element') {
      const you = run ? Run.you(run) : null;
      return {
        title: `${you ? ENAME[you.el] : 'Element'} awakening`,
        text: you
          ? `Your captain takes you aside: “${you.sig.name} is in you. Show me.” Pass and your element is yours for good — its gauge fills in matches, and a full gauge or a captain's buff turns your next attack into ${you.sig.name}.`
          : '',
        a: [
          'Take the trial',
          `${run ? Math.round(ElTrial.chance(run) * 100) : '?'}% chance (mood, stamina, wit): unlock ${ENAME[you ? you.el : 'fire']}; fail: −20 stamina, mood down, retry in ${ElTrial.retry} weeks`
        ],
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
    if (ev.id === 'gift') {
      // the gift chance (spec §4.35): a friend offers to show you a gift
      const G = GIFTS[ev.gift],
        p = run ? People.find(run, ev.who) : null,
        n = firstName(p, 'A friend'),
        short = run ? Math.max(0, ev.cost - run.money) : 0;
      return {
        title: `${n}: ${G.name}`,
        text: run ? Gifts.line('offer', run, ev.who, ev.gift) : '',
        a: [
          `Pay $${ev.cost}`,
          short ? `Short $${short}: no deal` : `${Math.round(ev.p * 100)}% chance: ${G.name} — ${G.desc} Fail: the money is gone`
        ],
        b: ['Decline', `${n} won't offer again`]
      };
    }
    if (ev.id === 'follow') {
      // a friend asks to follow you to your new club (spec §4.36 B, Circle)
      const p = run ? People.find(run, ev.who) : null,
        n = firstName(p, 'A friend'),
        T = run && run.teams[ev.to],
        short = run ? Math.max(0, ev.fee - run.money) : 0,
        seat = p ? `joins ${T ? T.name : 'your club'} (${p.role}); the seat's holder drops to the Academy squad` : '';
      return {
        title: `${n} wants to come`,
        text: run ? `${n}: ${Circle.line(run, ev)}` : '',
        a: [ev.fee ? `Bring ${n} · $${ev.fee}` : `Bring ${n}`, short ? `Short $${short}: ${n} stays` : `${n} ${seat}`],
        b: ['Not this time', `${n} stays behind${ev.from != null ? ' and remembers you walked out' : ''}`]
      };
    }
    return null; // the random training events are gone (owner, 2026-10-05); an old save's leftover clears on load
  },
  /** Fill {mate} and {cap}. */
  text(run, ev, s) {
    const T = Run.myTeam(run),
      mate = squadOf(T).find(p => p.id === ev.mate);
    // replacer functions: a name containing "$&" or "$'" must not be read as a replacement pattern
    return s.replace('{mate}', () => (mate ? mate.name : 'A teammate')).replace('{cap}', () => (T.cap ? T.cap.name : 'The captain'));
  },
  /** Apply choice 0 (a) or 1 (b); clears the event and returns the log line. */
  choose(run, i) {
    const ev = run.event;
    if (ev.id === 'element') {
      run.event = null;
      return i ? ElTrial.wait(run) : ElTrial.take(run);
    }
    if (ev.id === 'sponsor') {
      run.event = null;
      const id = ev.opts[i];
      return id ? Sponsors.sign(run, id) : 'Declined the sponsor offers.';
    }
    if (ev.id === 'gift') return Gifts.answer(run, i);
    if (ev.id === 'follow') return Circle.answer(run, i);
    run.event = null;
    return '';
  }
};
