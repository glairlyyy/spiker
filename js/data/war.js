// The faction war (spec §4.34): war units with Strength 0–100, their stages (match debuffs) and the overthrow. Read by
// js/career/war.js (War), js/career/front.js (Front) and, as a side's `weak` stage, by the match (T-314). Constants only.

/**
 * The war units (owner, 2026-10-19). Wei = two rings: Iron outside (its border faces the island), Gold inside (no border
 * while Iron stands; Iron's stage bleeds into Gold one step lighter). Wu = two coastal halves, independent: Harbor (east)
 * and Fort (south). Shu = one unit (Peak and Valley): street battles hit it × `soak`, its debuffs come `late` stages late.
 * clubs = FACTIONS indices. The minors (Outlaws, St. Gloria) and the Academy are in no unit.
 */
const WAR = {
  units: {
    iron: { region: 'wei', name: 'Wei Iron', clubs: [1] },
    gold: { region: 'wei', name: 'Wei Gold', clubs: [0], inner: 'iron' },
    harbor: { region: 'wu', name: 'Wu Harbor', clubs: [2] },
    fort: { region: 'wu', name: 'Wu Fort', clubs: [3] },
    shu: { region: 'shu', name: 'Shu', clubs: [4, 7], soak: 0.5, late: 1 }
  },
  start: 100,
  lose: 10, // a street battle lost on its border
  win: 3, // … won
  idle: 6, // untouched this many weeks: +regen a week
  regen: 2,
  rally: 20, // an overthrow the attacker lost: the defender rallies
  cool: 4, // weeks after an overthrow match before that unit can be challenged again
  ai: 10, // the AI challenges a Broken unit below this
  scatter: 2, // a destroyed club's best players who go to the winner's reserves
  ring: 3, // Gold's ring: Wei tiles at least this many hex steps from any other major's tile
  sim: 0.15, // a battle nobody joins: street strength 50 + sim × (Strength − 100)
  price: 0.003, // prices × (1 + price × points under 100)
  q: [0.7, 0.3] // facility quality × (q0 + q1 × Strength / 100)
};
/**
 * Stages by Strength (spec §4.34; first guesses): each adds to the one above. mor = morale at the start (−), heal = HP heal
 * between rallies (−), slots = card slots fewer. `below` = the Strength a unit falls under to reach it.
 */
const WAR_STAGES = [
  { id: 'steady', name: 'Steady', below: Infinity },
  { id: 'strained', name: 'Strained', below: 60, mor: 0.1 },
  { id: 'shaken', name: 'Shaken', below: 40, mor: 0.1, heal: 0.25 },
  { id: 'broken', name: 'Broken', below: 25, mor: 0.1, heal: 0.25, slots: 1 }
];
/**
 * Call-ups (spec §4.34, T-316): a member whose club's unit fights this week's street battle is called up; refusing it (the
 * battle settled without you on your side: you stayed away, watched, or fought for the other side) costs `refuse` standing
 * with your club's faction. lines: the call on the battle card, in the faction's voice (lore §7).
 */
const WAR_CALL = {
  refuse: -8,
  lines: {
    wei: 'The office expects every registered player on the line this week. Attendance is recorded.', // voice: wei
    wu: "Crew's going out. You're on the sheet. Don't make us come get you.", // voice: wu
    shu: 'The elders ask that you walk with us this week. They will not ask twice.' // voice: shu
  },
  refused: 'Didn’t answer the call-up. They noticed.' // voice: diary
};
