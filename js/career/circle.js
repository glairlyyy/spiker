// Your people (spec §4.36 B): the circle — up to CIRCLE.max people at bond CIRCLE.bond+ in any club, your starred people
// (`run.fav`) first — and the friend who asks to follow you when you switch clubs (World.join → Circle.asker / offer; the
// event card → Circle.answer). Read by the hub's squad strip and by Team (stories, Agent S). DOM-free; no R() — the ask is a hash.

const Circle = {
  /** Your circle: person ids (strings), pinned first, then by bond (then id). Only people still in play. */
  of(run) {
    const homes = People.homes(run),
      pins = new Set((run.fav || []).map(String)),
      me = run.youId,
      out = [];
    for (const k of Object.keys(run.mem || {})) {
      const [a, b] = k.split('|'),
        id = a === me ? b : b === me ? a : null;
      if (!id || !homes.has(id)) continue;
      const bond = Rel.bondOf(run, id);
      if (bond >= CIRCLE.bond) out.push({ id, bond, pin: pins.has(id) });
    }
    return out
      .sort((x, y) => y.pin - x.pin || y.bond - x.bond || (x.id < y.id ? -1 : 1))
      .slice(0, CIRCLE.max)
      .map(x => x.id);
  },
  /** Is id on your squad now? */
  mate: (run, id) => Run.mates(run).some(m => m.id === id),
  /** How they are this week (the strip): 'hurt' (injured), 'tired' (stamina under PEOPLE.sta.tired), 'out' (cut / benched), 'fine'. */
  mood(run, id) {
    const me = run.people && run.people[id];
    if (!me) return 'fine';
    if (me.inj > 0) return 'hurt';
    if (me.status && me.status !== 'active') return 'out';
    return Number.isFinite(me.sta) && me.sta < PEOPLE.sta.tired ? 'tired' : 'fine';
  },
  /**
   * Who of the teammates you are leaving asks to come along (or null): bond FOLLOW.bond+, not named, still active, closest first;
   * each asks on a hash under FOLLOW.p[their headline behaviour] (Loyal never). None while an event is open or in a cup.
   */
  asker(run, left) {
    if (run.event || Run.cupDef(run)) return null;
    const c = left
      .filter(p => !p.named && run.people[p.id] && run.people[p.id].status === 'active')
      .map(p => ({ p, bond: Rel.bondOf(run, p.id) }))
      .filter(x => x.bond >= FOLLOW.bond)
      .sort((x, y) => y.bond - x.bond || (x.p.id < y.p.id ? -1 : 1));
    for (const { p } of c) {
      const t = Rel.traits(run, p.id)[0],
        ch = FOLLOW.p[t] == null ? FOLLOW.p.other : FOLLOW.p[t];
      if (People.roll(run, p.id, 'follow') < ch) return p;
    }
    return null;
  },
  /** Open the follow card: p asks to come from squad `from` (club index, null = the Academy squad) to club `to`. */
  offer(run, p, from, to) {
    run.event = { id: 'follow', who: p.id, from, to, fee: Rel.traits(run, p.id)[0] === 'calculating' ? FOLLOW.fee : 0, pre: true };
  },
  /** Their line on the card (their headline behaviour's voice). */
  line(run, ev) {
    const t = Rel.traits(run, ev.who)[0],
      L = TEAM_LINES.ask;
    return (L[t] || L.other).replace('{fee}', () => `$${ev.fee}`);
  },
  /** The card's answer: 0 = bring them (pay a Mercenary's fee), 1 = not this time (their walked_out lands now). The log line. */
  answer(run, i) {
    const ev = run.event,
      p = People.find(run, ev.who),
      T = Run.myTeam(run),
      n = p ? p.name.split(' ')[0] : 'Someone',
      pickL = (L, salt) => L[Math.floor(hstr(`${salt}|${ev.who}|${Season.wk(run)}`) * L.length)];
    run.event = null;
    if (!p || p.gone || run.team !== ev.to || !p.team || Run.mates(run).includes(p)) return '';
    if (i === 0 && run.money >= ev.fee) {
      run.money -= ev.fee;
      Circle.move(run, p);
      Rel.add(run, p.id, 'event', 8);
      return `${pickL(TEAM_LINES.came, 'came').replace(/\{n\}/g, n).replace('{club}', T.name)}${ev.fee ? ` (−$${ev.fee})` : ''}`;
    }
    const old = ev.from == null ? run.pickup : run.teams[ev.from];
    if (ev.from != null) World.walkedOut(run, p.id);
    Rel.add(run, p.id, 'refused_help');
    return pickL(TEAM_LINES.stayed, 'stayed')
      .replace(/\{n\}/g, n)
      .replace('{old}', old ? old.name : 'the old club');
  },
  /**
   * A friend follows you into your club: they take a seat — the lowest same-role player (else the lowest) who is neither you nor
   * named — and that player drops to the Academy squad (via the friend's old squad: two seat swaps when it was a club).
   */
  move(run, f) {
    const T = Run.myTeam(run),
      you = Run.you(run),
      P = run.pickup,
      S = f.team,
      free = squadOf(T).filter(p => p !== you && !p.named),
      low = L => L.reduce((a, b) => (ovr(b) < ovr(a) ? b : a)),
      same = free.filter(p => p.role === f.role),
      h = same.length ? low(same) : free.length ? low(free) : null;
    if (!h) return false;
    World.swap(f, h); // f into your club, h into f's old seat
    if (S !== P) {
      const q = squadOf(P).find(p => p.role === h.role) || P.P[P.P.length - 1];
      World.swap(h, q); // h on to the Academy squad, its player into the club f left
      finalizeTeam(S);
    }
    finalizeTeam(T);
    finalizeTeam(P);
    delete you.bond[h.id];
    you.bond[f.id] = Rel.bondOf(run, f.id);
    delete run.ex[f.id];
    Run.news(run, `${f.name} follows ${you.name} to ${T.name}; ${h.name} drops to the Academy squad.`); // voice: wei (the Gazette)
    return true;
  }
};
