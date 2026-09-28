// Career world: factions on the eight league teams (join conditions), money, housing and paydays.
// Names are placeholders; balance is not tuned yet.

/**
 * One faction per league team (index = team index). `join`: what the club asks of a free agent —
 * ovr (overall), key (key stat of your role), star (★ status), fans, fee (money, paid on signing).
 */
const FACTIONS = [
  { name: 'Wei-Dynasty Academy', front: 'Elite corporate perfection', dark: 'Discards anyone who stops performing', join: { ovr: 72 } },
  { name: 'Wu-Navy Fort', front: 'Beach grinders, hard work over talent', dark: 'Seniority mafia and hazing', join: { key: 75 } },
  { name: 'Open Tryout Club', front: 'Anyone can try out', dark: 'Nobody stays long', join: { ovr: 55 } },
  { name: 'Old Tech High', front: 'A fallen prestige school', dark: 'Leaking roof, knee-wrecking drills', join: {} },
  { name: 'Shu-Dragon Club', front: 'One warm family', dark: 'Guilt-trips anyone who leaves', join: { star: true } },
  { name: 'Street Outlaws', front: 'Pavement courts under the overpass', dark: 'Illegal betting ring', join: { fee: 150 } },
  { name: 'St. Gloria International', front: 'World-class facilities', dark: 'Pay-to-win, sue-happy parents', join: { fee: 600 } },
  { name: 'Riverside Collective', front: 'Community club with a loud crowd', dark: 'Only plays people the fans love', join: { fans: 1500 } }
];
const ECON = {
  start: 200, // money at the start of a run
  allowance: 400, // from home, every payday
  payEvery: 4, // weeks between paydays (week 4, 8, …)
  food: 120, // per payday
  warmupWin: 60,
  warmupLoss: 10,
  cupWin: 150, // × the cup's multiplier
  place: { Quarterfinal: 100, Semifinal: 200, Final: 400, Champion: 800 } // × the cup's multiplier
};
/**
 * Housing: rent per payday; rest = stamina from a Rest week ×; moodPay = mood change on payday (chance);
 * sick = weekly chance of a cold (−15 stamina); noise = weekly chance of a bad night (mood −1); grit = leadership per payday.
 */
const HOUSING = {
  homeless: {
    name: 'Abandoned gym',
    rent: 0,
    rest: 0.6,
    moodPay: [-1, 0.6],
    sick: 0.1,
    grit: 2,
    desc: 'Free. Poor rest, mood sinks, you may get sick — but it toughens you (+leadership).'
  },
  studio: { name: 'Cheap studio', rent: 150, rest: 1, noise: 0.12, desc: 'Normal rest. Noisy neighbours now and then.' },
  dorm: { name: 'Campus dorm', rent: 300, rest: 1.25, moodPay: [1, 0.3], desc: 'Good rest, steady mood.' },
  condo: { name: 'Luxury condo', rent: 700, rest: 1.5, moodPay: [1, 1], desc: 'Best rest and mood every payday.' }
};
const HOUSEK = Object.keys(HOUSING);
