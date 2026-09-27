// Learning skills with skill points. The effects live in engine/skills.js (skillMod).

const Skills = {
  /** Skill ids your role may learn. */
  forRole: role => Object.keys(SKILLS).filter(id => skillRoleOk(SKILLS[id], role)),
  /** Not owned yet, affordable and allowed for your role. */
  canLearn(run, id) {
    const you = Run.you(run);
    return !you.skills.includes(id) && run.sp >= SKILLS[id].cost && Skills.forRole(you.role).includes(id);
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
