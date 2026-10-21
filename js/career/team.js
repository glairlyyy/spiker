// Team life (spec §4.36 2–4): the team chat after every match you play, personal arcs, duo cards and ex-teammates across the net.
// No DOM. No R() / rnd() / pick(): every choice is a hash (hstr). Data: TEAM, TEAM_CHAT, TEAM_REPLY (js/data/team.js).
// State (lazy, no RUN_DEFAULTS): run.tlife = { chat: { key, win, msgs: [{ id, sit, t }], done } | null, arcs: { id: arc },
// helped: { id: [years an arc was seen through] }, duo: { id: duo card id, once unlocked } }; an arc = { id, y (year), w (want), b (beat 0–2), st, at (week), alt? }, st:
// 'open' (the beat waits for your answer since week `at`) · 'wait' (you promised a match beside them, week `at`) · 'next' (the
// next beat opens at week `at`) · 'done' · 'lost'.
// Reads Agent T's contract behind guards: Circle.of(run) → ids (else your mates), run.ex = { id: week left } (else none).

/* global Circle -- Agent T’s circle (js/career/circle.js), read behind a typeof guard until it lands */
const Team = {
  /** The run's team-life state (created on first use). */
  of: run => run.tlife || (run.tlife = { chat: null }),
  /** Your circle (spec §4.36 B): Circle.of when it exists, else your current mates — ids of people only, at most TEAM.circle. */
  circle(run) {
    const ids = typeof Circle !== 'undefined' ? Circle.of(run) : Run.mates(run).map(p => p.id);
    return ids
      .map(String)
      .filter(id => run.people && run.people[id])
      .slice(0, TEAM.circle);
  },
  /** The people you left (spec §4.36 B): { id: week left } (Agent T's run.ex), {} before it exists. */
  ex: run => run.ex || {},
  /** Their headline behaviour (the first trait), or null. */
  beh: (run, id) => Rel.traits(run, id)[0] || null,
  first: p => (p ? p.name.split(' ')[0] : 'Someone'),
  /** A match line as one number (as Rel.afterMatch weighs it); null without a stat line. */
  line: s => (s ? s.k + 1.2 * s.blk + 1.2 * s.ace + 0.4 * s.dig + 0.35 * s.ast - s.err : null),
  /** A match's key for the hashes: the season week and how many matches you have logged. */
  key: run => `${Season.wk(run)}|${(run.mlog || []).length}`,
  /**
   * After every match of yours (Cup.record: you are side 0). Writes the chat (or clears it) — the replies, arcs and ex-teammates read
   * the same match.
   */
  matched(run, m) {
    const you = Run.you(run);
    if (!you || !m || !m.played) return;
    Team.chatFor(run, m, 0);
    if (!m.played.has(you.id)) return;
    Team.arcMatch(run, m, 0);
    for (const p of Team.exAcross(run, m, 0)) if (m.played.has(p.id)) Rel.add(run, p.id, 'faced_ex'); // (spec §4.36 B)
  },
  /** The situation of teammate p after match m (side = yours): 'win' | 'loss' + '_you' (your line beat theirs) | '_them' | ''. */
  sit(run, m, side, p) {
    const you = Run.you(run),
      won = m.winner === side,
      mine = Team.line(m.stat && m.stat[you.id]),
      theirs = m.played.has(p.id) ? Team.line(m.stat && m.stat[p.id]) : null,
      gap = REL.behave.proud.gap;
    let s = won ? 'win' : 'loss';
    if (mine != null && theirs != null) {
      if (mine - theirs >= gap) s += '_you';
      else if (theirs - mine >= gap) s += '_them';
    }
    return s;
  },
  /**
   * The team chat (spec §4.36 2): after a match you played, 2–4 teammates (people of your side's squad; those who played first, then
   * by hash) each say one line in their behaviour's voice for the result and both lines. Stored as run.tlife.chat until you reply;
   * a match you only watched clears it. Returns the chat or null.
   */
  chatFor(run, m, side) {
    const T = Team.of(run),
      you = Run.you(run);
    T.chat = null;
    if (!m.played.has(you.id)) return null;
    const key = Team.key(run),
      cand = squadOf(m.t[side])
        .filter(p => p.id !== you.id && !p.gone && run.people && run.people[p.id])
        .map(p => ({ p, on: m.played.has(p.id) ? 1 : 0, h: hstr(`chat|${key}|${p.id}`) }))
        .sort((a, b) => b.on - a.on || a.h - b.h),
      C = TEAM.chat,
      n = Math.min(cand.length, C.min + Math.floor(hstr(`chatn|${key}`) * (C.max - C.min + 1))),
      me = Team.first(you);
    if (!n) return null;
    const msgs = cand.slice(0, n).map(({ p }) => {
      const sit = Team.sit(run, m, side, p),
        B = TEAM_CHAT[Team.beh(run, p.id)] || TEAM_CHAT.steady,
        L = B[sit] || B[sit.split('_')[0]];
      return { id: p.id, sit, t: L[Math.floor(hstr(`chatl|${key}|${p.id}`) * L.length)].replace(/\{you\}/g, me) };
    });
    return (T.chat = { key, win: m.winner === side, msgs, done: null });
  },
  /** The chat waiting for your reply, or null. */
  pending(run) {
    const C = run.tlife && run.tlife.chat;
    return C && !C.done && C.msgs.length ? C : null;
  },
  /**
   * Your one reply to the chat (TEAM_REPLY kind): one memory with each teammate who wrote (value × their behaviour; none when 0).
   * Returns how many memories it wrote (0: no chat, already answered, or an unknown reply).
   */
  reply(run, kind) {
    const C = Team.pending(run),
      R0 = TEAM_REPLY[kind];
    if (!C || !R0) return 0;
    C.done = kind;
    let n = 0;
    for (const x of C.msgs) {
      const b = Team.beh(run, x.id),
        v = R0.v * (b in R0.by ? R0.by[b] : 1);
      if (!v || !People.find(run, x.id)) continue;
      Rel.add(run, x.id, R0.mem, v);
      n++;
    }
    Run.log(run, R0.log);
    return n;
  },
  // ---- personal arcs (spec §4.36 3, T-329) ----
  arcs: run => Team.of(run).arcs || (Team.of(run).arcs = {}),
  /** id's arc this season, or null. */
  arc(run, id) {
    const A = Team.arcs(run)[id];
    return A && A.y === Season.year(run) ? A : null;
  },
  /** The week id's arc may begin this season (hash). */
  startWeek(run, id) {
    const [a, b] = TEAM.arc.start;
    return a + Math.floor(hstr(`arc|${run.pseed}|${id}|${Season.year(run)}`) * (b - a + 1));
  },
  isMate: (run, id) => Run.mates(run).some(p => p.id === id),
  /** The beat as it plays now: ARCS data, with its `alt` when written one can't be (a match with someone off your squad; the seat after sitWait). */
  beat(run, A) {
    const B = ARCS[A.w].beats[A.b];
    if (!B.alt) return B;
    if (A.alt || (B.ask === 'match' && !Team.isMate(run, A.id)) || (B.ask === 'sit' && !Team.isMate(run, A.id))) return { ...B, ...B.alt };
    return B;
  },
  /** The arcs whose beat waits for your answer now: [arc]. */
  open: run => Object.values(Team.arcs(run)).filter(A => A.y === Season.year(run) && A.st === 'open'),
  /**
   * Each week (WEEK_START, no draws): beats that waited too long close quietly (no memory), the next beats open (the seat waits for a
   * match week, then becomes its alt), and circle members without an arc this season start one from their want (from their
   * hashed start week, up to TEAM.arc.last, at most TEAM.arc.max running).
   */
  week(run) {
    Team.duoWeek(run);
    const arcs = Team.arcs(run),
      y = Season.year(run),
      wk = run.week,
      X = TEAM.arc,
      n = A => Team.first(People.find(run, A.id));
    for (const A of Object.values(arcs)) {
      if (A.y !== y || A.st === 'done' || A.st === 'lost') continue;
      const p = People.find(run, A.id);
      if (!p || p.gone) {
        A.st = 'lost';
        continue;
      }
      if ((A.st === 'open' && wk > A.at + X.open) || (A.st === 'wait' && wk > A.at + X.wait)) {
        A.st = 'lost'; // no bond loss (owner, 2026-10-21): it just closes
        Run.log(run, `${n(A)} stopped asking. Fair enough.`);
      } else if (A.st === 'next' && wk >= A.at) {
        const B = ARCS[A.w].beats[A.b];
        if (B.ask === 'sit' && !A.alt && Team.isMate(run, A.id) && !Asks.matchWeek(run)) {
          if (wk <= A.at + X.sitWait) continue; // the seat waits for an evaluation week
          A.alt = 1;
        }
        A.st = 'open';
        A.at = wk;
        Run.log(run, `${n(A)} wants a word again. ${ARCS[A.w].name}, part ${A.b + 1}.`);
      }
    }
    if (wk > X.last) return;
    let live = Object.values(arcs).filter(A => A.y === y && ['open', 'wait', 'next'].includes(A.st)).length;
    for (const id of Team.circle(run)) {
      if (live >= X.max) break;
      const me = run.people[id],
        old = arcs[id];
      if ((old && old.y === y) || !me || !ARCS[me.want] || wk < Team.startWeek(run, id)) continue;
      const p = People.find(run, id);
      if (!p || p.gone) continue;
      arcs[id] = { id, y, w: me.want, b: 0, st: 'open', at: wk };
      live++;
      Run.log(run, `${Team.first(p)} wants a word. It sounded important to ${Team.first(p)}.`);
    }
  },
  /** What the beat costs, in words (the control's cost → result): '' for a choice. */
  cost(run, A) {
    const B = Team.beat(run, A),
      p = People.find(run, A.id);
    if (B.ask === 'money') return `$${B.amt}`;
    if (B.ask === 'day') {
      const at = p && Asks.place(run, p);
      return at ? `1 day · ${SPOTS[at].name}` : '1 day';
    }
    if (B.ask === 'match') return `your next match beside ${Team.first(p)} (${TEAM.arc.wait} weeks)`;
    if (B.ask === 'sit') return 'you sit out this evaluation';
    return '';
  },
  /**
   * Answer id's open beat: yes = help (pay, spend the day, promise the match, give the seat, or the kind answer), no = refuse (the
   * arc ends: arc_refused, unless the beat is `soft`; `back` pays you back). Returns { line, day?, at?, dayLine? }, { blocked } when
   * it can't be done now (the beat stays), or null.
   */
  answer(run, id, yes) {
    const A = Team.arc(run, id);
    if (!A || A.st !== 'open') return null;
    const B = Team.beat(run, A),
      p = People.find(run, id),
      n = Team.first(p),
      out = { line: '' },
      say = t => {
        out.line = t.replace(/\{n\}/g, n);
        Run.log(run, out.line);
        return out;
      };
    if (!yes) {
      A.st = 'lost';
      if (B.back) run.money += B.back;
      if (!B.soft) Rel.add(run, id, 'arc_refused');
      return say(B.no);
    }
    if (B.ask === 'money') {
      if (run.money < B.amt) return { blocked: `needs $${B.amt}` };
      run.money -= B.amt;
    } else if (B.ask === 'day') {
      const at = Asks.place(run, p);
      if (!at) return { blocked: 'nowhere to train together' };
      const can = City.can(run, at);
      if (!can.ok) return { blocked: can.why };
      Run.log(run, (out.dayLine = City.day(run, at, false, null)));
      out.day = true;
      out.at = at;
    } else if (B.ask === 'match') {
      A.st = 'wait';
      A.at = run.week;
      return say(`Promised ${n} my next match beside ${n}.`);
    } else if (B.ask === 'sit') run.sitout = { week: run.week, sit: 'you' }; // (Asks.sits: you sit out this week's evaluation)
    say(B.yes);
    Team.help(run, A);
    return out;
  },
  /** A beat helped: arc_help; the last one → arc_done (the big memory), their growth × TEAM.grow this season, the Cup lean. */
  help(run, A) {
    Rel.add(run, A.id, 'arc_help');
    if (A.b >= ARCS[A.w].beats.length - 1) {
      A.st = 'done';
      Rel.add(run, A.id, 'arc_done');
      const T = Team.of(run),
        h = (T.helped || (T.helped = {}))[A.id] || (T.helped[A.id] = []);
      if (!h.includes(A.y)) h.push(A.y);
      Run.log(run, `${ARCS[A.w].name}: seen through with ${Team.first(People.find(run, A.id))}.`);
      return;
    }
    A.b++;
    A.st = 'next';
    A.at = run.week + TEAM.arc.gap;
  },
  /** After a match of yours: a promised "match beside them" is kept when they played on your side. */
  arcMatch(run, m, side) {
    const ids = new Set(squadOf(m.t[side]).map(p => p.id));
    for (const A of Object.values(Team.arcs(run)))
      if (A.y === Season.year(run) && A.st === 'wait' && ids.has(A.id) && m.played.has(A.id)) {
        Run.log(run, ARCS[A.w].beats[A.b].yes.replace(/\{n\}/g, Team.first(People.find(run, A.id))));
        Team.help(run, A);
      }
  },
  /** An NPC's growth × (Gifts.grow reads it): TEAM.grow the season you saw their arc through, else 1. */
  growMul(run, p) {
    const h = p && run.tlife && run.tlife.helped && run.tlife.helped[p.id];
    return h && h.includes(Season.year(run)) ? TEAM.grow : 1;
  },
  /**
   * The year-2 Cup lean (Cup.entrants, after the draw — no draws): each friend you saw through an arc (any season) who is in your
   * squad's region and within TEAM.leanOvr of the weakest same-role player of your squad takes that seat on a hash < TEAM.lean (the
   * player they replace takes theirs, if they were drawn). Mutates `out`.
   */
  lean(run, out) {
    const helped = (run.tlife && run.tlife.helped) || {},
      e = out.find(x => x.ids.includes(run.youId)),
      riv = typeof Stars !== 'undefined' ? Stars.get(run, 'rival') : null;
    if (Season.year(run) < 2 || !e || !e.region || e.crew || e.academy || !Object.keys(helped).length) return;
    const all = Pool.players(run, e.region),
      byId = id => all.find(p => p.id === id),
      friends = Object.keys(helped)
        .map(byId)
        .filter(p => p && p !== riv && !e.ids.includes(p.id) && !People.out(run, p))
        .sort((a, b) => Rel.bondOf(run, b.id) - Rel.bondOf(run, a.id) || (a.id < b.id ? -1 : 1));
    for (const f of friends) {
      if (hstr(`lean|${run.pseed}|${f.id}`) >= TEAM.lean) continue;
      const same = e.ids.map(byId).filter(p => p && p.id !== run.youId && p.role === f.role && !helped[p.id] && p !== riv);
      if (!same.length) continue;
      const w = same.reduce((a, p) => (ovr(p) < ovr(a) ? p : a));
      if (ovr(f) < ovr(w) - TEAM.leanOvr) continue;
      const o = out.find(x => x !== e && x.ids.includes(f.id));
      if (o) o.ids[o.ids.indexOf(f.id)] = w.id;
      e.ids[e.ids.indexOf(w.id)] = f.id;
    }
  },
  // ---- duo cards and ex-teammates across the net (spec §4.36 4, B; T-330) ----
  /** The duo card for two roles, either way round (CARDS with src 'duo'), or null. */
  duoCard: (a, b) =>
    Object.keys(CARDS).find(id => {
      const d = CARDS[id].duo;
      return CARDS[id].src === 'duo' && d && ((d[0] === a && d[1] === b) || (d[0] === b && d[1] === a));
    }) || null,
  /** Has id's duo card been unlocked (bond TEAM.duo+ once: it stays)? */
  duoOk: (run, id) => !!(run.tlife && run.tlife.duo && run.tlife.duo[id]) || Rel.bondOf(run, id) >= TEAM.duo,
  /** Each week: a circle member past TEAM.duo for the first time unlocks their duo card (one per friend; a diary line). */
  duoWeek(run) {
    const T = Team.of(run),
      D = T.duo || (T.duo = {}),
      you = Run.you(run);
    if (!you) return;
    for (const id of Team.circle(run)) {
      const p = People.find(run, id),
        c = p && Team.duoCard(you.role, p.role);
      if (!c || D[id] || Rel.bondOf(run, id) < TEAM.duo) continue;
      D[id] = c;
      Run.log(run, `${Team.first(p)} and me have a move now: ${CARDS[c].name}.`);
    }
  },
  /** The people you left on the other side of match m (side = yours): [player]. */
  exAcross(run, m, side) {
    const ex = Team.ex(run);
    return squadOf(m.t[1 - side]).filter(p => p.id in ex);
  },
  /**
   * Before a match of yours (the UI's setup — watched or simmed): m.duo[your side] = { duo card id: [you, friends] } for squadmates with
   * an unlocked duo (the engine's pool and buffs read it; none → today's match), m.exIds = ex-teammates across the net (presentation).
   */
  setup(run, m) {
    const you = Run.you(run),
      side = you ? [0, 1].find(i => squadOf(m.t[i]).some(p => p.id === you.id)) : undefined;
    if (side == null) return;
    const by = {};
    for (const p of squadOf(m.t[side])) {
      if (p.id === you.id || !run.people || !run.people[p.id] || !Team.duoOk(run, p.id)) continue;
      const c = Team.duoCard(you.role, p.role);
      if (c) (by[c] || (by[c] = [you.id])).push(p.id);
    }
    if (Object.keys(by).length) {
      (m.duo || (m.duo = [null, null]))[side] = by;
      const C = m.cards && m.cards[side];
      if (C && !m.turnN && !Object.keys(C.you).length) {
        C.played = {}; // turn 0 again (newMatch's coach picked before the duo was known): the same counts, the duo in the pick
        cardFill(m, side);
      }
    }
    const ex = Team.exAcross(run, m, side);
    if (ex.length) m.exIds = ex.map(p => p.id);
  }
};
WEEK_START.push(run => Team.week(run)); // (appended at load: the arcs' weekly step, no draws — after Asks.roll and Gifts.ask)
