// League growth between weeks: every non-player athlete grinds, and some break through.
// Your teammates grow the same way, but training beside you adds gains and raises their breakthrough odds.

const Growth = {
  /** One week of growth for everyone except you, then re-finalize every team. */
  week(run) {
    const you = Run.you(run);
    People.week(run);
    Rel.week(run); // NPC careers: their plans give the XP (training, matches); the breakthrough rolls below stay random
    Stars.week(run); // the named follow their authored curves instead (spec §4.29)
    Growth.checkYou(run, you);
    for (const t of run.teams) {
      for (const p of squadOf(t)) if (p !== you) Growth.grow(run, p, t.i === run.team, you);
      finalizeTeam(t);
    }
    // faction reserves grind too (no bond factor)
    for (const t of Object.values(run.reserve || {})) {
      for (const p of squadOf(t)) Growth.grow(run, p, false, you);
      if (t.P.length) finalizeTeam(t);
    }
  },
  /** One player's week: the chance to break through to star, then OP (× potential; Hard league faster). Stat growth is People.week. */
  grow(run, p, mate, you) {
    const bf = 1 + (mate ? you.bond[p.id] || 0 : 0) / GROWTH.bondDiv,
      pot = (p.pot || 1) * (run.mode && run.mode.hard ? 1.15 : 1);
    if (p.named) return; // the named break through on their curve (Stars.week)
    if (!p.star && R() < GROWTH.star * pot * bf) Growth.awaken(run, p, mate, false);
    else if (p.star && !p.op && R() < GROWTH.op * pot * bf) Growth.awaken(run, p, mate, true);
  },
  /** Match XP scale: how strong the opponent is against you (ovr gap × MATCH_XP.perGap, clamped). */
  gapFactor: (mineOvr, oppOvr) => +clamp(1 + (oppOvr - mineOvr) * MATCH_XP.perGap, MATCH_XP.gap[0], MATCH_XP.gap[1]).toFixed(2),
  /** " (×1.6 vs a stronger side)" when the factor is not 1. */
  gapNote: f => (f > 1 ? ` (×${f} vs a stronger side)` : f < 1 ? ` (×${f} vs a weaker side)` : ''),
  /** The gap factor of match m: your side's 4 starters vs theirs (m.lineup0). */
  matchGap(m) {
    return Growth.gapFactor(teamOvr({ P: m.lineup0[0].P }), teamOvr({ P: m.lineup0[1].P }));
  },
  /**
   * Stat XP from your line in match m (its 4 starters vs theirs set the factor): each stat line unit × MATCH_XP.per,
   * through Training.addXp with source 'match' (past the training cap). Returns the text for the result line, or ''.
   */
  matchXp(run, m) {
    const s = m.stat[Run.you(run).id];
    if (!s) return '';
    const f = Growth.matchGap(m),
      xp = {};
    for (const [unit, map] of Object.entries(MATCH_XP.per))
      for (const [stat, v] of Object.entries(map)) xp[stat] = (xp[stat] || 0) + (s[unit] || 0) * v;
    const out = [];
    for (const stat of [...STATK, 'wit']) if (xp[stat]) out.push(Training.addXp(run, stat, Math.round(xp[stat] * f), 'match'));
    return out.length ? `XP: ${out.join(', ')}${Growth.gapNote(f)}` : '';
  },
  /** Your own star / OP status: earned by hitting the overall (and for OP, key stat + wit) criteria. */
  checkYou(run, you) {
    const o = ovr(you),
      C = CAREER;
    ElTrial.reveal(run, you);
    if (!you.star && o >= C.star.ovr) {
      you.star = true;
      you.bonus = Math.max(you.bonus, 18);
      Run.log(run, `You broke through — ${you.name} is now a ★ star!`, 'good');
    }
    if (you.star && !you.op && o >= C.op.ovr && you[KEYSTAT[you.role]] >= C.op.key && you.wit >= C.op.wit) {
      you.op = true;
      you.bonus = Math.max(you.bonus, 110);
      Run.log(run, `Awakening! ${you.name} is now an OP player — red star!`, 'good');
    }
  },
  /** Breakthrough: star (key stat +8, others +3), or a star turning OP (+6 everywhere, wit up). */
  awaken(run, p, mate, op) {
    const key = KEYSTAT[p.role];
    for (const k of STATK) p[k] = Math.min(99, p[k] + (op ? 6 : k === key ? 8 : 3));
    p.wit = +Math.min(2, p.wit + (op ? 0.25 : 0.1)).toFixed(2);
    if (op) {
      p.op = true;
      p.bonus = Math.max(p.bonus, 110);
    } else {
      p.star = true;
      p.bonus = Math.max(p.bonus, 18);
    }
    const what = op ? 'awakens as an OP player — red star!' : 'breaks through as a ★ star!';
    Run.log(run, mate ? `Your teammate ${p.name} ${what}` : `League news: ${p.name} (${p.team.name}) ${what}`);
    if (!mate) Run.news(run, `${p.name} (${p.team.name}) ${what}`);
  },
  /** A teammate trained with you: they take a share of your gains. */
  shared(run, id, pv) {
    const m = squadOf(Run.myTeam(run)).find(p => p.id === id);
    if (!m) return;
    const [mk, mv] = pv.main,
      [sk, sv] = pv.side;
    if (mk === 'wit') m.wit = +Math.min(2, m.wit + mv * GROWTH.share).toFixed(2);
    else m[mk] = Math.min(99, m[mk] + Math.round(mv * GROWTH.share));
    m[sk] = Math.min(99, m[sk] + Math.round(sv * GROWTH.share * 0.5));
  }
};
