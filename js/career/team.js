// Team life (spec §4.36 2–4): the team chat after every match you play, personal arcs, duo cards and ex-teammates across the net.
// No DOM. No R() / rnd() / pick(): every choice is a hash (hstr). Data: TEAM, TEAM_CHAT, TEAM_REPLY (js/data/team.js).
// State (lazy, no RUN_DEFAULTS): run.tlife = { chat: { key, win, msgs: [{ id, sit, t }], done } | null }.
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
  }
};
