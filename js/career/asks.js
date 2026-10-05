// Approaches (spec §4.23 C): NPCs act on their wants — up to REL.ask.max a week wait for you in the People sheet (accept / refuse, each
// expires at the week's end) — and every person card lists the moves you can make on them. Every answer becomes a memory (Rel.add).
// No DOM. No R() / rnd() / pick(): every roll is `People.roll`. An approach is never `run.event`: it blocks nothing.
// State: run.asks [{ id, kind, week, data, mine? }] (mine = an ask you made: it only marks "one ask per person per week"),
// run.loans { id: { amt, due } }, run.vouch { clubIndex: true }, run.sitout { week, sit: 'you' | id }, run.duo { id, week }.

const Asks = {
  first: p => p.name.split(' ')[0],
  /** The approaches waiting this week (with their index in run.asks). */
  list: run =>
    (run.asks || [])
      .map((a, i) => ({ ...a, i }))
      .filter(a => a.week === run.week && !a.mine && People.find(run, a.id) && !(a.kind === 'poach_advice' && Run.cupDef(run))),
  count: run => Asks.list(run).length,
  teamOf: (run, p) => run.teams.indexOf(p.team),
  isMate: (run, p) => Run.mates(run).includes(p),
  /** An evaluation, or a cup match outside the Story: a week with a place to give up. */
  matchWeek(run) {
    const wt = Run.weekType(run);
    return wt === 'eval' || (wt === 'cup' && !run.mode.story);
  },
  /** The coach's pick right now (dry): { starts, rival } as Run.lineup. */
  lineup: run => Run.lineup(run, Run.myTeam(run), City.myRegion(run), true),
  /** Where they train: their plan's place, else the first place for their key stat you can enter. */
  place(run, p) {
    const me = run.people[p.id],
      at = me.plan && me.plan.at;
    if (at && SPOTS[at] && City.access(run, at).ok) return at;
    return City.spotsFor(KEYSTAT[p.role]).find(id => City.access(run, id).ok) || null;
  },
  /** The mate p is in a feud with in your squad (not you): an id or null. */
  feud(run, p) {
    if (!Asks.isMate(run, p)) return null;
    const foe = Rel.chem(run, Run.myTeam(run)).foe[p.id];
    return [...foe].find(id => id !== run.youId) || null;
  },
  /** Their side: the rule each kind needs. Returns the ask's data, or null when they would not ask. */
  need: {
    invite_train(run, p, me, st) {
      if (st < 0 || People.out(run, p) || !(Asks.isMate(run, p) || run.met[p.id])) return null;
      const at = Asks.place(run, p);
      return at ? { at, day: 1 } : null;
    },
    ask_sitout(run, p) {
      if (!Asks.isMate(run, p) || p.role !== Run.you(run).role || !Asks.matchWeek(run)) return null;
      const L = Asks.lineup(run);
      return L.starts && L.rival && L.rival.p === p ? {} : null;
    },
    duo_challenge(run, p, me, st) {
      const open = run.duo && run.duo.week === run.week;
      return Asks.isMate(run, p) && ['grudge', 'money'].includes(me.want) && st >= REL.tags.respect && !People.out(run, p) && !open
        ? {}
        : null;
    },
    borrow(run, p, me, st) {
      if (!['money', 'leave'].includes(me.want) || st < 0 || !(Asks.isMate(run, p) || run.met[p.id]) || run.loans[p.id]) return null;
      const [a, b] = REL.ask.borrow,
        amt = Math.round((a + People.roll(run, p.id, 'amt') * (b - a)) / 10) * 10;
      return run.money >= amt ? { amt } : null;
    },
    call_out(run, p, me, st) {
      const ti = Asks.teamOf(run, p);
      return ti >= 0 && ti !== run.team && !Asks.isMate(run, p) && st <= REL.tags.resent ? { ti } : null;
    },
    vouch(run, p, me, st) {
      const ti = Asks.teamOf(run, p);
      return ti >= 0 && ti !== run.team && World.isFree(run) && !run.vouch[ti] && st >= REL.tags.ally ? { ti } : null;
    },
    take_side(run, p) {
      const o = Asks.feud(run, p);
      return o ? { o } : null;
    },
    warn(run, p, me, st) {
      if (st < REL.tags.respect) return null;
      const you = Run.you(run),
        facts = [],
        L = Asks.lineup(run),
        c = Fight.clashSite(run);
      if (L.rival && L.rival.p !== p)
        facts.push(
          `Word is ${Asks.first(L.rival.p)} ${L.starts ? 'is breathing down your neck' : 'is the one the coach trusts ahead of you'} at ${ROLE_NAME[you.role].toLowerCase()}.`
        );
      if (c) facts.push(`Word is there will be trouble at ${c.name} this week — ${REGIONS[c.a].name} against ${REGIONS[c.b].name}.`);
      const no = run.teams.find((t, ti) => ti !== run.team && (Fight.worth(run, ti, 0) || {}).verdict === 'refuses');
      if (no) facts.push(`Word is ${no.name} won't take your challenge.`);
      return facts.length ? { text: facts[Math.floor(People.roll(run, p.id, 'warnfact') * facts.length)] } : null;
    }
  },
  /** A new week's approaches: last week's unanswered ones become `ignored`, then the best REL.ask.max candidates are stored. */
  roll(run) {
    for (const a of run.asks || [])
      if (!a.mine && a.week < run.week) {
        if (a.kind === 'poach_advice' && !Run.cupDef(run)) {
          const line = People.leave(run, a.id, a.data.to); // unanswered: they go anyway (the Gazette says so, as for an answered one)
          if (line) Run.news(run, line);
        }
        Rel.add(run, a.id, 'ignored');
      }
    run.asks = (run.asks || []).filter(a => a.week >= run.week);
    if (run.asks.some(a => !a.mine && a.kind !== 'poach_advice' && a.week === run.week)) return;
    const cand = [];
    for (const p of People.all(run)) {
      const me = run.people[p.id],
        st = Rel.stance(run, p.id);
      for (const [kind, A] of Object.entries(APPROACH)) {
        const o = kind === 'take_side' ? Asks.feud(run, p) : null; // (weighed by your stance with both of them)
        if (kind === 'take_side' && !o) continue;
        const chance = REL.ask.base * (A.w[me.want] || 0) * (1 + Math.max(0, st + (o ? Rel.stance(run, o) : 0)) / 100),
          r = People.roll(run, p.id, 'ask|' + kind);
        if (r >= chance) continue;
        const data = Asks.need[kind](run, p, me, st);
        if (data) cand.push({ id: p.id, kind, week: run.week, data, score: r / chance });
      }
    }
    cand.sort((a, b) => a.score - b.score || (a.id < b.id ? -1 : 1));
    const seen = new Set(),
      kinds = new Set();
    for (const c of cand) {
      if (run.asks.length >= REL.ask.max) break;
      if (seen.has(c.id) || kinds.has(c.kind)) continue; // one approach a person, one of each kind a week
      seen.add(c.id);
      kinds.add(c.kind);
      delete c.score;
      run.asks.push(c);
    }
  },
  /** Their line to you, in the voice of their home. */
  line(run, a) {
    const p = People.find(run, a.id),
      A = APPROACH[a.kind];
    let t = A.text[p ? People.home(run, p) : 'academy'] || A.text.academy;
    if (a.kind === 'borrow') t += ` ($${a.data.amt})`;
    if (a.kind === 'warn') t = a.data.text;
    if (a.kind === 'take_side') {
      const o = People.find(run, a.data.o);
      t = t.replace('{o}', o ? Asks.first(o) : 'them');
    }
    if (a.kind === 'call_out' && a.data.ti != null && run.teams[a.data.ti]) t += ` (${run.teams[a.data.ti].name})`;
    return t;
  },
  /** The next payday at or after the week after this one. */
  nextPay: run => Math.min(CAREER.weeks, Math.ceil((run.week + 1) / ECON.payEvery) * ECON.payEvery),
  /**
   * Answer the approach at run.asks[i]. Returns { line, fx?, day? } (line = the diary line, already logged; fx = a match to start;
   * day = a training day was spent; dayLine = its diary line), or { blocked } when it can't be done now (the approach stays).
   */
  answer(run, i, yes) {
    const a = (run.asks || [])[i];
    if (!a || a.mine || a.week !== run.week || (a.kind === 'poach_advice' && Run.cupDef(run))) return null;
    const p = People.find(run, a.id),
      n = p ? Asks.first(p) : 'Someone',
      out = { line: '' },
      done = line => {
        run.asks.splice(i, 1);
        Run.log(run, line);
        Run.save(run);
        out.line = line;
        return out;
      };
    switch (a.kind) {
      case 'invite_train': {
        if (!yes) return done(`Not today, ${n}. I have a schedule. Sort of.`);
        const can = City.can(run, a.data.at);
        if (!can.ok) return { blocked: can.why };
        Run.log(run, (out.dayLine = City.day(run, a.data.at, false, null)));
        Rel.add(run, a.id, 'invited');
        out.day = true;
        return done(`Trained with ${n} at ${SPOTS[a.data.at].name}.`);
      }
      case 'ask_sitout':
        if (yes) {
          run.sitout = { week: run.week, sit: 'you' };
          Rel.add(run, a.id, 'spot_given');
          return done(`Gave my seat to ${n} this week. They owe me.`);
        }
        Rel.add(run, a.id, 'refused_help');
        return done(`Told ${n} no. The seat stays mine.`);
      case 'duo_challenge':
        if (yes) {
          run.duo = { id: a.id, week: run.week };
          Rel.add(run, a.id, 'duo');
          return done(`${n} and me, next challenge this week. Stake split.`);
        }
        return done(`Not my fight, ${n}.`);
      case 'borrow':
        if (yes) {
          if (run.money < a.data.amt) return { blocked: `needs $${a.data.amt}` };
          run.money -= a.data.amt;
          run.loans[a.id] = { amt: a.data.amt, due: Asks.nextPay(run) };
          return done(`Lent ${n} $${a.data.amt}. Back on payday, they say.`);
        }
        Rel.add(run, a.id, 'refused_help');
        return done(`Said no to ${n}'s loan. Not a bank.`);
      case 'call_out': {
        if (yes) {
          const fx = Fight.challenge(run, a.data.ti, 0, true);
          if (!fx) return { blocked: Fight.ban(run) || 'not now' };
          out.fx = fx;
          return done(`Took ${n}'s call-out: ${run.teams[a.data.ti].name}.`);
        }
        Rel.add(run, a.id, 'ducked');
        const lab = [Run.bump(run, 'fans', -REL.ask.callout.fans), City.repBump(run, FACTIONS[a.data.ti].region, -REL.ask.callout.rep)];
        return done(`Ducked ${n}'s call-out. ${lab.filter(Boolean).join(', ')}`);
      }
      case 'vouch':
        if (yes) {
          run.vouch[a.data.ti] = true;
          Rel.add(run, a.id, 'vouched');
          return done(`${n} will vouch for me at ${run.teams[a.data.ti].name}.`);
        }
        return done(`Told ${n} I'd manage alone.`);
      case 'take_side': {
        const o = People.find(run, a.data.o),
          on = o ? Asks.first(o) : 'them',
          [w, l] = yes ? [a.id, a.data.o] : [a.data.o, a.id]; // yes = their side, no = the other's
        Rel.add(run, w, 'sided_with');
        Rel.add(run, l, 'sided_against');
        return done(yes ? `Took ${n}'s side against ${on}.` : `Took ${on}'s side against ${n}.`);
      }
      case 'poach_advice':
        if (yes) {
          Rel.add(run, a.id, 'advised');
          const news = People.leave(run, a.id, a.data.to);
          if (news) Run.news(run, news);
          return done(news ? `Told ${n} to go. ${n} went.` : `Told ${n} to go. ${n} stayed after all.`);
        }
        if (run.people[a.id].want === 'leave') Rel.add(run, a.id, 'held_back');
        else Rel.add(run, a.id, 'advised', 4);
        return done(`Told ${n} to stay. ${n} stayed.`);
      default:
        Rel.add(run, a.id, 'warned');
        return done(`Noted. ${a.data.text}`);
    }
  },
  /** How likely they say yes to your ask: clamp(0.5 + stance / 100 + trait mods). */
  accept(run, id, kind) {
    const M = REL.ask.mine;
    let v = 0.5 + Rel.stance(run, id) / 100;
    for (const t of Rel.traits(run, id)) {
      if (t === 'warm') v += M.warm;
      if (t === 'cynical') v += M.cynical;
      if (t === 'proud' && kind === 'ask_sitout') v += M.proud;
    }
    return clamp(v, 0.05, 0.95);
  },
  word: v => (v >= 0.65 ? 'likely' : v >= 0.4 ? 'maybe' : 'unlikely'),
  /** What you can ask of / do to this person now: [{ kind, label, word?, at?, ti? }] (one ask a person a week). */
  moves(run, id) {
    const p = People.find(run, id),
      me = run.people && run.people[id];
    if (!p || p.gone || !me || (run.asks || []).some(a => a.mine && a.id === id && a.week === run.week) || run.event) return [];
    const you = Run.you(run),
      n = Asks.first(p),
      out = [],
      known = Asks.isMate(run, p) || run.met[id],
      add = (kind, label, o = {}) =>
        out.push({ kind, label, word: kind === 'call_out' ? '' : Asks.word(Asks.accept(run, id, kind)), ...o });
    if (known && !People.out(run, p)) {
      const mine = City.spotsFor(KEYSTAT[you.role]).find(s => City.access(run, s).ok),
        ats = [Asks.place(run, p), mine].filter((s, i, l) => s && l.indexOf(s) === i && City.can(run, s).ok);
      for (const at of ats) add('invite_train', `Invite ${n} to train at ${SPOTS[at].name}`, { at });
    }
    if (Asks.isMate(run, p) && p.role === you.role && Asks.matchWeek(run)) {
      const L = Asks.lineup(run);
      if (!L.starts && L.rival && L.rival.p === p) add('ask_sitout', `Ask ${n} to sit out this match`);
    }
    const ti = Asks.teamOf(run, p);
    if (ti >= 0 && ti !== run.team) {
      if (World.isFree(run) && !run.vouch[ti] && Rel.tag(run, id) === 'ally')
        add('vouch', `Ask ${n} to vouch for you at ${run.teams[ti].name}`, { ti });
      if (run.met[id] && !Fight.ban(run) && !City.noTime(run, City.scoutCost(run, ti)))
        add('call_out', `Call out ${run.teams[ti].name}`, { ti });
    }
    return out;
  },
  /** Make one of Asks.moves. Returns { yes, line, fx?, day? } or null. */
  ask(run, id, kind, o = {}) {
    const mv = Asks.moves(run, id).find(m => m.kind === kind && (m.at || null) === (o.at || null));
    if (!mv) return null;
    const p = People.find(run, id),
      n = Asks.first(p),
      out = { yes: false, line: '' },
      end = line => {
        Run.log(run, line);
        Run.save(run);
        out.line = line;
        return out;
      };
    run.asks.push({ id, kind, week: run.week, mine: true });
    if (kind === 'call_out') {
      const fx = Fight.challenge(run, mv.ti, 0, true);
      Rel.add(run, id, 'called_out');
      if (fx) out.fx = fx;
      out.yes = !!fx;
      return end(`Called out ${run.teams[mv.ti].name}. ${n} will hear about it.`);
    }
    out.yes = People.roll(run, id, `you|${kind}|${run.week}`) < Asks.accept(run, id, kind);
    if (!out.yes) return end(`Asked ${n}. ${n} said no.`);
    if (kind === 'invite_train') {
      Run.log(run, (out.dayLine = City.day(run, mv.at, false, null)));
      Rel.add(run, id, 'invited');
      out.day = true;
      return end(`${n} came to ${SPOTS[mv.at].name}.`);
    }
    if (kind === 'ask_sitout') {
      run.sitout = { week: run.week, sit: id };
      Rel.add(run, id, 'sat_for_you');
      return end(`${n} sits out for me this week.`);
    }
    run.vouch[mv.ti] = true;
    Rel.add(run, id, 'vouched');
    return end(`${n} will vouch for me at ${run.teams[mv.ti].name}.`);
  },
  /** Loans: from their due payday the borrower may repay (by trait); every week still unpaid is a debt_unpaid memory. */
  week(run) {
    for (const [id, L] of Object.entries(run.loans || {})) {
      if (run.week < L.due) continue;
      const ts = Rel.traits(run, id),
        pr = ts.length
          ? ts.reduce((s, t) => s + (REL.ask.repay[t] != null ? REL.ask.repay[t] : REL.ask.repay.other), 0) / ts.length
          : REL.ask.repay.other,
        p = People.find(run, id);
      if (World.isPayday(run) && People.roll(run, id, `repay|${run.week}`) < pr) {
        run.money += L.amt;
        delete run.loans[id];
        Rel.add(run, id, 'lent_money');
        Run.log(run, `${p ? Asks.first(p) : 'Someone'} paid back $${L.amt}. On time. Suspicious.`);
      } else Rel.add(run, id, 'debt_unpaid');
    }
  },
  /** Is this person sitting out this week's match (a granted ask)? */
  sits: (run, p) =>
    !!(run.sitout && run.sitout.week === run.week && (run.sitout.sit === 'you' ? p.id === run.youId : p.id === run.sitout.sit))
};
