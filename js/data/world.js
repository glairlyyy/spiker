// Career world: the island's regions and factions (two squads per major, two minors), join conditions, money,
// housing and paydays.
// Names are placeholders; balance is not tuned yet.

/**
 * The island's powers. Three majors hold clear borders (Wei the city, Wu the whole coastline, Shu the highlands);
 * minors have no border of their own — a patch inside or across the majors' land. Each region prices and equips
 * its places its own way: price × the base fee; q = training quality; hype = chance a premium (Wei) place is
 * overhyped (really just average); gem = chance a rough (Shu) place is a hidden gem; zone = travel zone (see
 * TRAVEL); at = where you stand on the map while there; hotel = a night's price there (× nothing: already local).
 */
const REGIONS = {
  wei: {
    zone: 'city',
    at: [700, 300],
    name: 'Wei Dynasty',
    kind: 'major',
    price: 2,
    q: 1.25,
    hype: 0.3,
    desc: 'The city: top facilities at top prices — not all of them live up to it'
  },
  wu: {
    zone: 'coast',
    at: [470, 585],
    name: 'Wu Navy',
    kind: 'major',
    price: 1,
    q: 1,
    desc: 'The coastline: mid prices, mid facilities; the sand courts are the best place to build technique'
  },
  shu: {
    zone: 'high',
    at: [300, 290],
    name: 'Shu Highlands',
    kind: 'major',
    price: 0.5,
    q: 0.8,
    gem: 0.15,
    desc: 'Mountain towns far from the city: everything cheap and rough — now and then a hidden gem'
  },
  outlaws: {
    zone: 'border',
    at: [815, 470],
    name: 'Street Outlaws',
    kind: 'minor',
    price: 1,
    q: 1,
    desc: 'Cages and courts under the overpass, on the Wei–Wu line'
  },
  gloria: {
    zone: 'city',
    at: [690, 255],
    name: 'St. Gloria',
    kind: 'minor',
    price: 3,
    q: 1.35,
    desc: 'A private club inside the city: the best money can buy'
  },
  open: { zone: 'country', at: [500, 290], name: 'Open country', kind: 'none', price: 1, q: 0.9, desc: 'Nobody’s land between the powers' }
};
/**
 * One faction per league team (index = team index; styles come from TEAMDEFS). Each major fields two squads.
 * `team` rebrands the league team for the career; `join`: what the club asks of a free agent —
 * ovr (overall), key (key stat of your role), star (★ status), fans, fee (money, paid on signing).
 */
const FACTIONS = [
  {
    region: 'wei',
    name: 'Wei Dynasty · Gold',
    team: ['Wei Dynasty Gold', 'WDG', '#F5B82E'],
    front: 'The academy’s elite first squad',
    dark: 'Discards anyone who stops performing',
    join: { ovr: 72 }
  },
  {
    region: 'wei',
    name: 'Wei Dynasty · Iron',
    team: ['Wei Dynasty Iron', 'WDI', '#C98B2B'],
    front: 'The academy’s second squad, hungry for promotion',
    dark: 'Everyone is fighting for one spot upstairs',
    join: { ovr: 62 }
  },
  {
    region: 'wu',
    name: 'Wu Navy · Harbor',
    team: ['Wu Navy Harbor', 'WNH', '#4EA5FF'],
    front: 'Fast harbor crew, sand-trained',
    dark: 'Seniority mafia and hazing',
    join: {}
  },
  {
    region: 'wu',
    name: 'Wu Navy · Fort',
    team: ['Wu Navy Fort', 'WNF', '#2EC4B6'],
    front: 'Beach grinders, hard work over talent',
    dark: 'Border brawls with Wei every season',
    join: { key: 70 }
  },
  {
    region: 'shu',
    name: 'Shu Dragon · Peak',
    team: ['Shu Dragon Peak', 'SDP', '#4ADE80'],
    front: 'One warm mountain family',
    dark: 'Guilt-trips anyone who leaves',
    join: { star: true }
  },
  {
    region: 'outlaws',
    name: 'Street Outlaws',
    team: ['Street Outlaws', 'SOL', '#FF8C42'],
    front: 'Pavement courts under the overpass',
    dark: 'Illegal betting ring',
    join: { fee: 150 }
  },
  {
    region: 'gloria',
    name: 'St. Gloria International',
    team: ['St. Gloria', 'STG', '#FF5DA2'],
    front: 'World-class facilities',
    dark: 'Pay-to-win, sue-happy parents',
    join: { fee: 600 }
  },
  {
    region: 'shu',
    name: 'Shu Dragon · Valley',
    team: ['Shu Dragon Valley', 'SDV', '#22A06B'],
    front: 'The valley squad: raw kids from mountain villages',
    dark: 'Nobody from the city is trusted',
    join: { ovr: 55 }
  }
];
const ECON = {
  start: 200, // money at the start of a run
  allowance: 500, // from home, every payday
  payEvery: 4, // weeks between paydays (week 4, 8, …)
  food: 120, // per payday
  warmupWin: 60,
  warmupLoss: 10,
  cupWin: 150, // × the cup's multiplier
  place: { Quarterfinal: 100, Semifinal: 200, Final: 400, Champion: 800 } // × the cup's multiplier
};
/**
 * Housing (region: where it is on the island): rent per payday; rest = stamina from a Rest week ×; moodPay = mood
 * change on payday (chance); sick = weekly chance of a cold (−15 stamina); noise = weekly chance of a bad night
 * (mood −1); grit = leadership per payday.
 */
const HOUSING = {
  homeless: {
    name: 'Abandoned gym',
    region: 'open',
    rent: 0,
    rest: 0.6,
    moodPay: [-1, 0.6],
    sick: 0.1,
    grit: 2,
    desc: 'Free. Poor rest, mood sinks, you may get sick — but it toughens you (+leadership).'
  },
  highland: {
    name: 'Highland room',
    region: 'shu',
    rent: 60,
    rest: 1.1,
    desc: 'Cheap, clean mountain air — but a long trip to the city and the coast.'
  },
  studio: { name: 'Beach shack', region: 'wu', rent: 150, rest: 1, noise: 0.12, desc: 'Normal rest. Noisy beach parties now and then.' },
  dorm: { name: 'City dorm', region: 'wei', rent: 300, rest: 1.25, moodPay: [1, 0.3], desc: 'Good rest, steady mood.' },
  condo: { name: 'Luxury condo', region: 'wei', rent: 700, rest: 1.5, moodPay: [1, 1], desc: 'Best rest and mood every payday.' }
};
const HOUSEK = Object.keys(HOUSING);
/**
 * Travel between zones: 0 = the same place (act and still have the evening), 1 = near (the trip takes the evening),
 * 2 = far (the trip takes the whole day: travel there first). The border (the Outlaws' overpass) touches the city and
 * the coast; the highlands are far from everything.
 */
const TRAVEL = {
  city: { city: 0, border: 0, coast: 1, country: 1, high: 2 },
  coast: { coast: 0, border: 0, city: 1, country: 1, high: 2 },
  border: { border: 0, city: 0, coast: 0, country: 1, high: 2 },
  country: { country: 0, city: 1, coast: 1, border: 1, high: 1 },
  high: { high: 0, country: 1, city: 2, coast: 2, border: 2 }
};
/** A night at a hotel away from home: base price (× the region's price). */
const HOTEL = { price: 30, rest: 1 };
