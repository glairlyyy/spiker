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
  lose: 8, // a street battle lost on its border
  win: 3, // … won
  idle: 4, // untouched this many weeks: +regen a week
  regen: 2,
  rally: 20, // an overthrow the attacker lost: the defender rallies
  cool: 4, // weeks after an overthrow match before that unit can be challenged again
  ai: 10, // the AI challenges a Broken unit below this
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
