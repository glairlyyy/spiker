// Learning skills with skill points. The effects live in engine/skills.js (skillMod).

const Skills = {
  /** Skill ids your role may learn. */
  forRole: role => Object.keys(SKILLS).filter(id => skillRoleOk(SKILLS[id], role)),
  /** Not owned yet, affordable and allowed for your role. */
  canLearn(run, id) {
    const you = Run.you(run);
    return !SKILLS[id].tech && !you.skills.includes(id) && run.sp >= SKILLS[id].cost && Skills.forRole(you.role).includes(id);
  },
  /** Names of the techniques a player uses (learned or by stats): for scouting. */
  techs: p =>
    Object.keys(SKILLS)
      .filter(id => SKILLS[id].tech && hasTech(p, id))
      .map(id => SKILLS[id].name),
  /**
   * After a match you played (see LEARN): maybe learn one technique — by doing, else by facing an opponent who has it.
   * One R() per candidate considered; the first success ends it. Returns the log text ('' if nothing was learned).
   */
  tryLearn(run, m) {
    const you = Run.you(run),
      s = m.stat[you.id],
      f = Growth.matchGap(m),
      foes = m.t[1] ? squadOf(m.t[1]).filter(p => m.played.has(p.id)) : [];
    if (!s) return '';
    for (const id of Skills.forRole(you.role)) {
      const t = SKILLS[id];
      if (!t.tech || you.skills.includes(id)) continue;
      const [stats, n] = LEARN.do[t.tech],
        did = stats.split('+').reduce((a, k) => a + (s[k] || 0), 0) >= n,
        teacher = !did && foes.find(p => hasTech(p, id)),
        base = did ? LEARN.doP : teacher ? LEARN.faceP : 0;
      if (!base) continue;
      if (R() < clamp(base * (0.5 + you.wit / 2) * f, 0, 0.5)) {
        you.skills.push(id);
        return `Learned ${t.name} in play (${did ? 'by doing' : 'from ' + teacher.name})`;
      }
    }
    return '';
  },
  /** Spend skill points on `id`; false when it can't be learned. Saves the run. */
  learn(run, id) {
    if (!Skills.canLearn(run, id)) return false;
    run.sp -= SKILLS[id].cost;
    Run.you(run).skills.push(id);
    Run.log(run, `Learned ${SKILLS[id].name}.`);
    Run.save(run);
    return true;
  }
};
