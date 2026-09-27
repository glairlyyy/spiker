// Learning skills with skill points. The effects live in engine/skills.js (skillMod).

const Skills = {
  forRole: role => Object.keys(SKILLS).filter(id => skillRoleOk(SKILLS[id], role)),
  canLearn(run, id) {
    const you = Run.you(run);
    return !you.skills.includes(id) && run.sp >= SKILLS[id].cost && Skills.forRole(you.role).includes(id);
  },
  learn(run, id) {
    if (!Skills.canLearn(run, id)) return false;
    run.sp -= SKILLS[id].cost;
    Run.you(run).skills.push(id);
    Run.log(run, `Learned ${SKILLS[id].name}.`);
    Run.save(run);
    return true;
  }
};
