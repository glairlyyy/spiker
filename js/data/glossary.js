// Glossary (spec §9.4, §9.6): every repeated idea once — an icon key, a short alias and the one full explanation
// (registrar voice: what it is and the numbers, never why). `term(id, n)` (js/ui/dom.js) renders an alias chip with
// this text as its tooltip; Encyclopedia › Glossary lists them all. `icon` is a StatIcons key (js/ui/icons.js), or 'text' for
// ideas that read as their alias word (Sim, Seize, U21 Cup…).

const GLOSSARY = {
  power: { icon: 'pow', short: 'Power', long: 'Power. Key stat of wing spikers. Kills and aces.' },
  def: { icon: 'def', short: 'Defense', long: 'Defense. Digs and receives.' },
  speed: { icon: 'spd', short: 'Speed', long: 'Speed. Key stat of setters. Reaching the ball.' },
  jump: { icon: 'jmp', short: 'Jump', long: 'Jump. Key stat of middle blockers. Blocks and attack height.' },
  wit: { icon: 'wit', short: 'Wit', long: 'Wit. Reads, sets and dumps. Counts in 0.02 steps.' },
  lead: {
    icon: 'led',
    short: 'Leadership',
    long: 'Leadership. The captain is the squad member with the most. Captain levels at 55, 70, 85.'
  },
  sta: {
    icon: 'sta',
    short: 'Stamina',
    long: 'Stamina. Training and fights cost it; rest and the week end restore it. Below 25 a failed session may injure you.'
  },
  day: { icon: 'day', short: 'Day', long: `Day. ${WEEK_DAYS} a week. Every action takes one, plus the trip there.` },
  money: { icon: 'mon', short: '$', long: 'Money. Allowance on payday, minus food and rent. Pays for places, fees and crews.' },
  sp: { icon: 'sp', short: 'Skill pts', long: 'Skill points. Earned in matches and goals. Spent on career skills and the physio.' },
  fans: { icon: 'fan', short: 'Fans', long: 'Fans. Earned in matches, battles and goals. Sponsors make offers at set totals.' },
  mood: { icon: 'mood', short: 'Mood', long: `Mood. ${MOODS.map(m => m.name || m).join(' · ')}. Multiplies training gains.` },
  bond: { icon: 'bond', short: 'Bond', long: 'Bond 0–100 with a teammate. 60+: two-player combos. 80+: friendship training ×1.5.' },
  standing: {
    icon: 'std',
    short: 'Standing',
    long: `Standing with a faction, −100 … +100. Street battle: win +${CLASH.win}, lose ${CLASH.lose}; the side you fight against ${CLASH.other}.`
  },
  grade: {
    icon: 'grd',
    short: 'Grade',
    long: `Grade S–C from your own line. Rewards ${GRADES.map(([g, , x]) => `${g} ×${x}`).join(', ')}. S: mood up.`
  },
  seize: {
    icon: 'text',
    short: 'Seize',
    long: `Border meter. ${FRONT.seize} net battle wins on a border seize a place; lost places come back first.`
  },
  border: { icon: 'text', short: 'Border', long: `Border place. Changes hands after ${FRONT.seize} net street-battle wins on its border.` },
  sim: { icon: 'text', short: 'Sim', long: 'Sim. The result without watching. Same rules, same rewards.' },
  academy: { icon: 'text', short: 'Academy', long: 'Academy squad. You play evaluations and the U21 Cup with it until a club signs you.' },
  cup: {
    icon: 'text',
    short: 'U21 Cup',
    long: `${CUPS[0].name}. After week ${CUPS[0].after}. Knock-out; a loss ends the season. Rewards ×${CUPS[0].mul}.`
  },
  trial: {
    icon: 'text',
    short: 'Trial',
    long: 'Element Trial. Reveal at OVR 70; become a ★ star; grade S in a match where your team reaches the zone.'
  },
  quality: {
    icon: 'text',
    short: 'Quality',
    long: 'Training quality ×. ★★? = advertised, unrated: overhyped or a hidden gem. Known after one session there (★★✓).'
  },
  together: { icon: 'text', short: 'Together', long: 'Teammates training at the same place: +20% each, +50% at bond 80+.' },
  rewards: {
    icon: 'text',
    short: 'Rewards',
    long: `Match rewards. Win and loss chips; +${REWARDS.perPlay.sp} skill pts +${REWARDS.perPlay.fans} fans per kill, block or ace; × Grade.`
  }
};
