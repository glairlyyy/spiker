// NPC careers (spec §4.23 A, H): wants, traits, weekly plans and the numbers behind their activity-based growth.
// Data only; the logic is js/career/people.js. Tables are weights unless noted.

/** What an NPC is after. */
const WANTS = {
  national: { name: 'The national team', desc: 'The national team: plays every match it can, takes risks.' },
  money: { name: 'Money', desc: 'Hustles and takes paid challenges.' },
  spot: { name: 'A starting spot', desc: 'Keeps their starting role; hostile to same-role threats.' },
  grudge: { name: 'A grudge', desc: 'Has a faction to beat: challenges it, joins street battles.' },
  prove: { name: 'To prove them wrong', desc: 'Proves the elders wrong: trains Hard, overtrains.' },
  leave: { name: 'A way out', desc: 'Gets off the island any way possible; disloyal.' }
};
/** Want weights by home (a faction region, or `academy` for the Academy squad). */
const WANT_BY = {
  wei: { national: 3, spot: 3, money: 2, grudge: 1, prove: 0.5, leave: 0.5 },
  wu: { grudge: 3, spot: 2, national: 2, money: 1, prove: 1, leave: 1 },
  shu: { prove: 3, national: 2, spot: 1, grudge: 1, money: 1, leave: 1 },
  outlaws: { money: 3, leave: 2, grudge: 2, prove: 1, spot: 0.5, national: 0.5 },
  gloria: { national: 3, money: 2, spot: 2, leave: 1, prove: 0.5, grudge: 0.5 },
  academy: { national: 3, prove: 2, spot: 2, money: 1, leave: 1, grudge: 0.5 }
};
/** How an NPC behaves. */
const TRAITS = {
  proud: { name: 'Proud', desc: 'Hates being second.' },
  loyal: { name: 'Loyal', desc: 'Sticks with their own.' },
  jealous: { name: 'Jealous', desc: 'Counts what others get.' },
  warm: { name: 'Warm', desc: 'Lets people in.' },
  cynical: { name: 'Cynical', desc: 'Expects the worst, and is rarely wrong.' },
  reckless: { name: 'Reckless', desc: 'Pushes past the warning signs.' },
  calculating: { name: 'Calculating', desc: 'Every move has a reason.' },
  steady: { name: 'Steady', desc: 'Does the work, every day.' }
};
/** Opposite pairs: an NPC never has both of a pair. */
const TRAIT_OPP = [
  ['warm', 'cynical'],
  ['reckless', 'steady'],
  ['loyal', 'calculating']
];
/** Trait weight multipliers by want (others 1). */
const TRAIT_BY_WANT = {
  grudge: { proud: 2, jealous: 2 },
  money: { calculating: 2, cynical: 2 },
  prove: { reckless: 2, proud: 2 },
  national: { steady: 1.5, proud: 1.5 },
  spot: { jealous: 2 },
  leave: { cynical: 2, calculating: 2 }
};
/**
 * Weekly plan weights by want: key = train the key stat, weak = train the lowest stat, hard = key stat on Hard,
 * wit = train wit, rest, hustle = street games for cash (match XP).
 */
const PLAN = {
  national: { key: 3, weak: 2, hard: 1, wit: 1, rest: 1, hustle: 0.3 },
  money: { key: 1, weak: 1, hard: 0.3, wit: 0.3, rest: 1, hustle: 3 },
  spot: { key: 4, weak: 1, hard: 1, wit: 0.5, rest: 1, hustle: 0.3 },
  grudge: { key: 2, weak: 1, hard: 1, wit: 0.3, rest: 0.7, hustle: 2 },
  prove: { key: 2, weak: 1, hard: 3, wit: 0.5, rest: 0.4, hustle: 0.5 },
  leave: { key: 1, weak: 1, hard: 0.5, wit: 0.5, rest: 1.5, hustle: 2 }
};
/** Plan weight multipliers by trait (others 1); both of an NPC's traits apply. */
const PLAN_TRAIT = {
  reckless: { hard: 2, rest: 0.5 },
  steady: { hard: 0.5, rest: 1.3 },
  proud: { key: 1.3 },
  calculating: { weak: 1.3, wit: 1.5 },
  cynical: { rest: 1.3 }
};
/**
 * The numbers. sessions: training sessions a week. xp: base XP per session (× place quality × potential × Hard league ×
 * `hard` on a Hard session), through the same curve as yours (Training.need). sta: stamina costs / gains (0–100).
 * hurt: chance a Hard session injures (`low` when stamina < lowSta), injury length in weeks. hustle: match XP (key stat 0.4, the others 0.2 each)
 * from a week of street games. play: weekly match XP (key stat 0.4, the others 0.2 each) for a league-team starter (they play off screen).
 */
const PEOPLE = {
  sessions: 4,
  xp: 20,
  hard: 1.6,
  sta: { train: 15, hard: 25, hustle: 10, rest: 60, week: 20, tired: 35 },
  hurt: { hard: 0.04, low: 0.12, lowSta: 40, weeks: [1, 3] },
  hustle: 100,
  play: 100
};
