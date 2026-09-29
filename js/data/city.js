// The island map, all claimed: Wei the city (north and east), Wu the beach (the east and south coast) and a strip
// inland, Shu the highlands (west); the Sacred Shrine Park in the middle belongs to nobody, by common respect;
// the minors sit as borderless patches inside or across them. You arrive at the airport on the south coast.
// Coordinates are in map units (1000 × 640). Names are placeholders; balance is not tuned yet.

const CITY = (() => {
  const coast = [
      [90, 140],
      [200, 70],
      [360, 48],
      [520, 60],
      [680, 40],
      [830, 80],
      [930, 170],
      [965, 300],
      [925, 430],
      [845, 540],
      [700, 600],
      [540, 612],
      [380, 592],
      [230, 560],
      [120, 480],
      [58, 360],
      [52, 240]
    ],
    c = [510, 330],
    // the coast pulled 18% toward the middle (Wei's east edge follows it)
    inner = coast.map(([x, y]) => [Math.round(c[0] + (x - c[0]) * 0.82), Math.round(c[1] + (y - c[1]) * 0.82)]),
    /** Wu's border with Wei (north → south), then inland back to the south coast. */
    wuWei = [...inner.slice(6, 9), [740, 470], [600, 450]],
    /** Shu's border with Wei, north coast → the Wu line (runs under the shrine park). */
    shuWei = [coast[3], [480, 160], [500, 250], [500, 390], [520, 450], [540, 500]];
  return {
    w: 1000,
    h: 640,
    coast,
    inner,
    /** Wei's city: its east and south sides are the contested border with Wu. */
    wei: [...coast.slice(3, 7), ...wuWei, ...shuWei.slice(1).reverse()],
    /** The contested Wei–Wu border. */
    contest: wuWei,
    /** The beach: the east coast round to the south (coast points). */
    beach: coast.slice(6, 13),
    /** Wu: the beach and the land behind it up to Wei, plus a strip inland in the south. */
    wu: [...coast.slice(6, 13), [430, 540], [540, 500], ...wuWei.slice().reverse()],
    /** Shu's highlands: the whole west, coast to coast. */
    shu: [...coast.slice(12), ...coast.slice(0, 4), ...shuWei.slice(1), [430, 540]],
    /** The Sacred Shrine Park: neutral ground on the Shu–Wei line. */
    park: { x: 500, y: 320, r: 72 },
    /** Borderless minors: ellipses { x, y, rx, ry, rot }. */
    minors: {
      outlaws: { x: 815, y: 470, rx: 78, ry: 42, rot: -35 },
      gloria: { x: 690, y: 255, rx: 58, ry: 40, rot: 10 }
    },
    /** Region label anchors. */
    label: { open: [500, 412], wei: [690, 330], shu: [300, 300], wu: [740, 628], outlaws: [835, 500], gloria: [690, 222] },
    airport: [470, 600],
    /** Each club's HQ (team index → [x, y]). */
    hq: [
      [640, 210],
      [610, 400],
      [915, 305],
      [620, 510],
      [360, 220],
      [790, 465],
      [700, 262],
      [230, 400]
    ],
    mountains: [
      [220, 250],
      [270, 205],
      [330, 190],
      [390, 240],
      [205, 330],
      [420, 330],
      [320, 420]
    ]
  };
})();

/** Home turf: training in your own faction's region gives this bonus. */
const TURF_BONUS = 0.1;
/** A training session's fee before the region's price (one day's session). */
const TRAIN_FEE = 8;
/** Travel by map distance: free within NEAR_R, then a day per TRIP_DAY units, at most TRIP_MAX days. */
const NEAR_R = 110;
const TRIP_DAY = 220;
const TRIP_MAX = 3;
/** The dark map: each point you've stood on lights up this radius. */
const REVEAL_R = 170;
/** Days in a training week; every action takes one (+ the trip).*/
const WEEK_DAYS = 7;
/** A day's session is a fraction of the old week-long one: gains and skill points ×. */
const DAY_GAIN = 0.25;
/** Sand courts: technique training — skill points from a session ×. */
const SAND_SP = 2;

/**
 * Places. Each takes a day (+ the trip there). slot: 'day' (training, rest, recreation) or 'eve' (an outing — kept
 * for the map's grouping). train: the training key done there. region: see REGIONS (null = your home: goes with your housing).
 * cost: money for an outing (× the region's price). sand: technique training (SAND_SP).
 */
const SPOTS = {
  // Wei — the city: premium, pricey, maybe overhyped
  weiPower: { name: 'Dynasty Strength Center', slot: 'day', train: 'power', region: 'wei', at: [615, 330], icon: '🏋' },
  weiSpeed: { name: 'Dome Sprint Lab', slot: 'day', train: 'speed', region: 'wei', at: [760, 330], icon: '🏃' },
  weiWit: { name: 'Academy Film Library', slot: 'day', train: 'wit', region: 'wei', at: [680, 410], icon: '🎞' },
  weiJump: { name: 'Skytower Plyo Gym', slot: 'day', train: 'jump', region: 'wei', at: [575, 185], icon: '🏀' },
  gloria: { name: 'St. Gloria Private Club', slot: 'day', train: 'def', region: 'gloria', at: [735, 275], icon: '💎' },
  // Wu — the coast: mid everything; sand courts build technique
  sand: { name: 'Sand Courts', slot: 'day', train: 'def', region: 'wu', sand: true, at: [560, 565], icon: '🏖' },
  dunes: { name: 'Dune Sprints', slot: 'day', train: 'speed', region: 'wu', at: [915, 240], icon: '🌊' },
  harbor: { name: 'Harbor Gym', slot: 'day', train: 'power', region: 'wu', at: [905, 380], icon: '⚓' },
  pier: { name: 'Pier Jump Deck', slot: 'day', train: 'jump', region: 'wu', sand: true, at: [615, 600], icon: '🪂' },
  // Shu — the highlands: cheap and rough, far from everything
  trail: { name: 'Mountain Trail', slot: 'day', train: 'speed', region: 'shu', at: [215, 290], icon: '⛰' },
  steps: { name: 'Thousand Steps', slot: 'day', train: 'jump', region: 'shu', at: [320, 235], icon: '🛕' },
  dojo: { name: 'Highland Dojo', slot: 'day', train: 'def', region: 'shu', at: [395, 360], icon: '🥋' },
  stone: { name: 'Stone Gym', slot: 'day', train: 'power', region: 'shu', at: [420, 475], icon: '🪨' },
  shrine: { name: 'Shrine Library', slot: 'day', train: 'wit', region: 'shu', at: [320, 410], icon: '📜' },
  // the minors and the shrine park
  cage: { name: 'Overpass Cage', slot: 'day', train: 'power', region: 'outlaws', at: [845, 455], icon: '⛓' },
  park: {
    name: 'Sacred Shrine Park',
    slot: 'day',
    act: 'rec',
    region: 'open',
    at: [500, 330],
    icon: '🌳',
    desc: 'Recreation on holy ground: mood up, +10 stamina'
  },
  home: { name: 'Home', slot: 'day', act: 'rest', region: null, icon: '🏠', desc: 'Rest: +30–60 stamina (× how well you sleep there)' },
  // hotels: a night's rest away from home, at the region's price
  hotelWei: {
    name: 'City Hotel',
    slot: 'day',
    act: 'rest',
    hotel: true,
    region: 'wei',
    at: [820, 290],
    icon: '🏨',
    desc: 'Rest at a hotel'
  },
  hotelWu: { name: 'Seaside Inn', slot: 'day', act: 'rest', hotel: true, region: 'wu', at: [765, 545], icon: '🏨', desc: 'Rest at an inn' },
  hotelShu: {
    name: 'Mountain Lodge',
    slot: 'day',
    act: 'rest',
    hotel: true,
    region: 'shu',
    at: [410, 250],
    icon: '🏨',
    desc: 'Rest at a lodge'
  },
  // evenings
  noodles: {
    name: 'Noodle Bar',
    slot: 'eve',
    act: 'ramen',
    region: 'wei',
    at: [720, 380],
    icon: '🍜',
    cost: 15,
    desc: 'Dinner with a teammate: +6 bond, +10 stamina'
  },
  hutNoodles: {
    name: 'Mountain Noodles',
    slot: 'eve',
    act: 'ramen',
    region: 'shu',
    at: [350, 290],
    icon: '🍲',
    cost: 15,
    desc: 'Dinner with a teammate: +6 bond, +10 stamina'
  },
  arcade: {
    name: 'Neon Arcade',
    slot: 'eve',
    act: 'arcade',
    region: 'wei',
    at: [640, 260],
    icon: '🕹',
    cost: 15,
    desc: 'Night out with the team: mood up, +3 bond with everyone'
  },
  bonfire: {
    name: 'Beach Bonfire',
    slot: 'eve',
    act: 'arcade',
    region: 'wu',
    at: [680, 572],
    icon: '🔥',
    cost: 15,
    desc: 'Night out with the team: mood up, +3 bond with everyone'
  },
  street: {
    name: 'Overpass Court',
    slot: 'eve',
    act: 'street',
    region: 'outlaws',
    at: [785, 490],
    icon: '💵',
    desc: 'Street hustle for cash: win on your OVR, −12 stamina'
  }
};
/** Street hustle tuning: rival OVR range, stake won / lost, fans on a win. */
const STREET = { rival: [50, 78], win: [40, 90], loss: 20, fans: 40, sta: 12 };
/** Scouting a club at its HQ (a day): stamina cost. */
const SCOUT_STA = 5;
/** Where you live on the map, by housing. */
const HOME_AT = { homeless: [600, 115], highland: [180, 330], studio: [430, 575], dorm: [640, 440], condo: [760, 395] };
