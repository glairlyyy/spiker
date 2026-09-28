// The island map: Wei holds the city, Wu the whole coastline (a band around the island), Shu the inland highlands;
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
    // Wu's band: the coast down to this inner line (the coast pulled 18% toward the middle)
    inner = coast.map(([x, y]) => [Math.round(c[0] + (x - c[0]) * 0.82), Math.round(c[1] + (y - c[1]) * 0.82)]);
  return {
    w: 1000,
    h: 640,
    coast,
    inner,
    /** Wei's city: its east side runs along Wu's inner line (the contested border). */
    wei: [[590, 170], ...inner.slice(5, 9), [740, 470], [600, 450], [545, 320]],
    /** Shu's highlands, inland to the west. */
    shu: [
      [160, 220],
      [290, 150],
      [420, 175],
      [460, 290],
      [410, 420],
      [260, 450],
      [150, 360]
    ],
    /** Borderless minors: ellipses { x, y, rx, ry, rot }. */
    minors: {
      outlaws: { x: 815, y: 470, rx: 78, ry: 42, rot: -35 },
      gloria: { x: 690, y: 255, rx: 58, ry: 40, rot: 10 }
    },
    /** Region label anchors. */
    label: { wei: [690, 330], shu: [300, 300], wu: [520, 628], outlaws: [835, 500], gloria: [690, 222] },
    airport: [470, 600],
    /** Each club's HQ (team index → [x, y]). */
    hq: [
      [640, 210],
      [610, 400],
      [870, 230],
      [130, 440],
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
/** A training session's fee before the region's price. */
const TRAIN_FEE = 20;
/** Sand courts: technique training — skill points from a session ×. */
const SAND_SP = 2;

/**
 * Places. slot: 'day' (the week's main action: a training, rest or recreation) or 'eve' (one optional evening
 * outing). train: the training key done there. region: see REGIONS (null = your home: goes with your housing).
 * cost: money for an outing (× the region's price). sand: technique training (SAND_SP).
 */
const SPOTS = {
  // Wei — the city: premium, pricey, maybe overhyped
  weiPower: { name: 'Dynasty Strength Center', slot: 'day', train: 'power', region: 'wei', at: [615, 330], icon: '🏋' },
  weiSpeed: { name: 'Dome Sprint Lab', slot: 'day', train: 'speed', region: 'wei', at: [760, 330], icon: '🏃' },
  weiWit: { name: 'Academy Film Library', slot: 'day', train: 'wit', region: 'wei', at: [680, 410], icon: '🎞' },
  weiJump: { name: 'Skytower Plyo Gym', slot: 'day', train: 'jump', region: 'wei', at: [780, 215], icon: '🏀' },
  gloria: { name: 'St. Gloria Private Club', slot: 'day', train: 'def', region: 'gloria', at: [735, 275], icon: '💎' },
  // Wu — the coast: mid everything; sand courts build technique
  sand: { name: 'Sand Courts', slot: 'day', train: 'def', region: 'wu', sand: true, at: [330, 572], icon: '🏖' },
  dunes: { name: 'Dune Sprints', slot: 'day', train: 'speed', region: 'wu', at: [95, 400], icon: '🌊' },
  harbor: { name: 'Harbor Gym', slot: 'day', train: 'power', region: 'wu', at: [905, 380], icon: '⚓' },
  pier: { name: 'Pier Jump Deck', slot: 'day', train: 'jump', region: 'wu', sand: true, at: [560, 72], icon: '🪂' },
  // Shu — the highlands: cheap and rough, far from everything
  trail: { name: 'Mountain Trail', slot: 'day', train: 'speed', region: 'shu', at: [215, 290], icon: '⛰' },
  steps: { name: 'Thousand Steps', slot: 'day', train: 'jump', region: 'shu', at: [320, 235], icon: '🛕' },
  dojo: { name: 'Highland Dojo', slot: 'day', train: 'def', region: 'shu', at: [395, 360], icon: '🥋' },
  stone: { name: 'Stone Gym', slot: 'day', train: 'power', region: 'shu', at: [300, 330], icon: '🪨' },
  shrine: { name: 'Shrine Library', slot: 'day', train: 'wit', region: 'shu', at: [320, 410], icon: '📜' },
  // the minors and open country
  cage: { name: 'Overpass Cage', slot: 'day', train: 'power', region: 'outlaws', at: [845, 455], icon: '⛓' },
  park: {
    name: 'Riverside Park',
    slot: 'day',
    act: 'rec',
    region: 'open',
    at: [500, 330],
    icon: '🌳',
    desc: 'Recreation: mood up, +10 stamina'
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
  hotelWu: { name: 'Seaside Inn', slot: 'day', act: 'rest', hotel: true, region: 'wu', at: [720, 565], icon: '🏨', desc: 'Rest at an inn' },
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
    at: [205, 520],
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
  },
  sleep: { name: 'Home', slot: 'eve', act: 'sleep', region: null, icon: '🌙', desc: 'Early night: +10 stamina' }
};
/** Street hustle tuning: rival OVR range, stake won / lost, fans on a win. */
const STREET = { rival: [50, 78], win: [40, 90], loss: 20, fans: 40, sta: 12 };
/** Scouting a club at its HQ (evening): stamina cost. */
const SCOUT_STA = 5;
/** Where you live on the map, by housing. */
const HOME_AT = { homeless: [470, 250], highland: [180, 330], studio: [430, 575], dorm: [640, 440], condo: [760, 395] };
