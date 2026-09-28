// The city map: eight faction districts around a neutral downtown, and the places you visit each week.
// Coordinates are in map units (viewBox 1000 × 640). Names are placeholders; balance is not tuned yet.

/** District polygons, index = league team / faction index. Downtown is an ellipse in the middle. */
const CITY = (() => {
  const top = [
      [0, 0],
      [240, 0],
      [520, 0],
      [770, 0],
      [1000, 0]
    ],
    mid = [
      [0, 300],
      [270, 330],
      [490, 310],
      [790, 335],
      [1000, 305]
    ],
    bot = [
      [0, 640],
      [250, 640],
      [510, 640],
      [760, 640],
      [1000, 640]
    ],
    districts = [];
  for (let j = 0; j < 4; j++) districts.push([top[j], top[j + 1], mid[j + 1], mid[j]]);
  for (let j = 0; j < 4; j++) districts.push([mid[j], mid[j + 1], bot[j + 1], bot[j]]);
  return {
    w: 1000,
    h: 640,
    districts,
    downtown: { x: 500, y: 320, rx: 140, ry: 80 },
    /** Where each faction's HQ sits (team index → [x, y]). */
    hq: [
      [110, 120],
      [390, 90],
      [650, 110],
      [890, 130],
      [120, 500],
      [380, 540],
      [640, 520],
      [880, 500]
    ],
    /** Label anchor per district. */
    label: [
      [125, 36],
      [380, 36],
      [645, 36],
      [885, 36],
      [130, 618],
      [380, 618],
      [635, 618],
      [880, 618]
    ]
  };
})();

/** Home turf: training at a place in your own club's district gives this bonus. */
const TURF_BONUS = 0.1;

/**
 * Places. slot: 'day' (the week's main action: a training, rest or recreation) or 'eve' (one optional evening
 * outing). train: the training key done there. d: district index (null = downtown). cost: money.
 */
const SPOTS = {
  gym: { name: 'Iron Gym', slot: 'day', train: 'power', d: 0, at: [200, 220], icon: '🏋' },
  beach: { name: 'Harbor Beach', slot: 'day', train: 'def', d: 1, at: [330, 200], icon: '🏖' },
  track: { name: 'Riverside Track', slot: 'day', train: 'speed', d: 7, at: [860, 390], icon: '🏃' },
  roof: { name: 'Rooftop Court', slot: 'day', train: 'jump', d: 6, at: [600, 420], icon: '🏀' },
  film: { name: 'Film Room', slot: 'day', train: 'wit', d: 3, at: [880, 240], icon: '🎞' },
  park: { name: 'Central Park', slot: 'day', act: 'rec', d: 2, at: [620, 230], icon: '🌳', desc: 'Recreation: mood up, +10 stamina' },
  home: { name: 'Home', slot: 'day', act: 'rest', d: null, icon: '🏠', desc: 'Rest: +30–60 stamina (× how well you sleep there)' },
  ramen: {
    name: 'Ramen Stand',
    slot: 'eve',
    act: 'ramen',
    d: null,
    at: [455, 300],
    icon: '🍜',
    cost: 20,
    desc: 'Dinner with a teammate: +6 bond, +10 stamina'
  },
  arcade: {
    name: 'Arcade',
    slot: 'eve',
    act: 'arcade',
    d: null,
    at: [560, 345],
    icon: '🕹',
    cost: 30,
    desc: 'Night out with the team: mood up, +3 bond with everyone'
  },
  street: {
    name: 'Overpass Court',
    slot: 'eve',
    act: 'street',
    d: 5,
    at: [300, 440],
    icon: '💵',
    desc: 'Street hustle for cash: win on your OVR, −12 stamina'
  },
  sleep: { name: 'Home', slot: 'eve', act: 'sleep', d: null, icon: '🌙', desc: 'Early night: +10 stamina' }
};
/** Street hustle tuning: rival OVR range, stake won / lost, fans on a win. */
const STREET = { rival: [50, 78], win: [40, 90], loss: 20, fans: 40, sta: 12 };
/** Scouting a club at its HQ (evening): stamina cost. */
const SCOUT_STA = 5;
/** Where you live on the map, by housing. */
const HOME_AT = { homeless: [930, 290], studio: [420, 360], dorm: [700, 560], condo: [60, 230] };
