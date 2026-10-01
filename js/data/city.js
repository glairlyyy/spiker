// The island map, all claimed: Wei the city (north and east), Wu the beach (the east and south coast) and a strip
// inland, Shu the highlands (west); Central Academy in the middle belongs to nobody, by common respect;
// the minors sit as borderless patches inside or across them. You arrive at the airport on the south coast.
// Coordinates are in map units (1060 × 700). Names are placeholders; balance is not tuned yet.

const CITY = (() => {
  const coast = [
      [90, 140],
      [200, 70],
      [360, 48],
      [520, 60],
      [680, 40],
      [846, 68],
      [972, 154],
      [1010, 297],
      [969, 441],
      [883, 564],
      [726, 637],
      [545, 657],
      [360, 632],
      [215, 573],
      [120, 480],
      [58, 360],
      [52, 240]
    ],
    // the original coast (pulled 18% toward the middle), frozen as literals: Wei's east edge follows it, no border moves
    inner = [
      [166, 174],
      [256, 117],
      [387, 99],
      [518, 109],
      [649, 92],
      [772, 125],
      [854, 199],
      [883, 305],
      [850, 412],
      [785, 502],
      [666, 551],
      [535, 561],
      [403, 545],
      [280, 519],
      [190, 453],
      [139, 355],
      [134, 256]
    ],
    // the dune line: the beach's inner edge (the old coast, points 6–12); the sand lies between it and the coast
    dunes = [
      [930, 170],
      [965, 300],
      [925, 430],
      [845, 540],
      [700, 600],
      [540, 612],
      [380, 592]
    ],
    /** Wu's border with Wei (north → south), then inland back to the south coast. */
    wuWei = [...inner.slice(6, 9), [740, 470], [600, 450]],
    /** Shu's border with Wei, north coast → the Wu line (ends at the tri-point where Central Academy sits). */
    shuWei = [coast[3], [480, 160], [500, 250], [500, 390], [520, 450], [540, 500]];
  return {
    w: 1060,
    h: 700,
    coast,
    inner,
    dunes,
    /** Wei's city: its east and south sides are the contested border with Wu. */
    wei: [...coast.slice(3, 7), ...wuWei, ...shuWei.slice(1).reverse()],
    /** The contested Wei–Wu border. */
    contest: wuWei,
    /** The beach: the east coast round to the south (coast points 6–12; the sand is between them and `dunes`). */
    beach: coast.slice(6, 13),
    /** Wu: the beach and the land behind it up to Wei, plus a strip inland in the south. */
    wu: [...coast.slice(6, 13), [430, 540], [540, 500], ...wuWei.slice().reverse()],
    /** Shu's highlands: the whole west, coast to coast. */
    shu: [...coast.slice(12), ...coast.slice(0, 4), ...shuWei.slice(1), [430, 540]],
    /** Central Academy: neutral ground at the tri-point of Wei, Wu and Shu (north of the airport). */
    park: { x: 540, y: 500, r: 60 },
    /** The old ritual ground's sand circle, by the Academy (a landmark with no pin and no label). */
    ritual: [595, 548],
    /** Borderless minors: ellipses { x, y, rx, ry, rot }. */
    minors: {
      outlaws: { x: 815, y: 470, rx: 78, ry: 42, rot: -35 },
      gloria: { x: 690, y: 255, rx: 58, ry: 40, rot: 10 }
    },
    /** Region label anchors. */
    label: { open: [545, 432], wei: [690, 330], shu: [300, 300], wu: [680, 545], outlaws: [835, 500], gloria: [690, 222] },
    airport: [470, 600],
    /** Each club's HQ (team index → [x, y]). */
    hq: [
      [640, 210],
      [610, 400],
      [940, 310],
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
  sand: { name: 'Sand Courts', slot: 'day', train: 'def', region: 'wu', sand: true, at: [560, 632], icon: '🏖' },
  dunes: { name: 'Dune Sprints', slot: 'day', train: 'speed', region: 'wu', at: [975, 240], icon: '🌊' },
  harbor: { name: 'Harbor Gym', slot: 'day', train: 'power', region: 'wu', at: [935, 385], icon: '⚓' },
  pier: { name: 'Pier Jump Deck', slot: 'day', train: 'jump', region: 'wu', sand: true, at: [615, 646], icon: '🪂' },
  // Shu — the highlands: cheap and rough, far from everything
  trail: { name: 'Mountain Trail', slot: 'day', train: 'speed', region: 'shu', at: [215, 290], icon: '⛰' },
  steps: { name: 'Thousand Steps', slot: 'day', train: 'jump', region: 'shu', at: [320, 235], icon: '🛕' },
  dojo: { name: 'Highland Dojo', slot: 'day', train: 'def', region: 'shu', at: [395, 360], icon: '🥋' },
  stone: { name: 'Stone Gym', slot: 'day', train: 'power', region: 'shu', at: [420, 475], icon: '🪨' },
  shrine: { name: 'Shrine Library', slot: 'day', train: 'wit', region: 'shu', at: [320, 410], icon: '📜' },
  // the minors and Central Academy
  cage: { name: 'Overpass Cage', slot: 'day', train: 'power', region: 'outlaws', at: [845, 455], icon: '⛓' },
  park: {
    name: 'Academy Grounds',
    slot: 'day',
    act: 'rec',
    region: 'open',
    at: [540, 500],
    icon: '🏛',
    desc: 'Campus lawns, open to every student. Mood up, +10 stamina.'
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
  hotelWu: { name: 'Seaside Inn', slot: 'day', act: 'rest', hotel: true, region: 'wu', at: [735, 525], icon: '🏨', desc: 'Rest at an inn' },
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
    at: [620, 262],
    icon: '🕹',
    cost: 15,
    desc: 'Night out with the team: mood up, +3 bond with everyone'
  },
  bonfire: {
    name: 'Beach Bonfire',
    slot: 'eve',
    act: 'arcade',
    region: 'wu',
    at: [680, 622],
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
const HOME_AT = { homeless: [600, 115], highland: [180, 330], studio: [430, 622], dorm: [640, 440], condo: [760, 395] };

/**
 * Official venues (spec §4.21): where official matches are played. Landmarks with a pin and a card, always known (no fog).
 * kind = the 3D landmark; `holds` = what is played there (`cup` = the U21 Final Cup, `eval:<region>` = that faction's evaluations;
 * the Academy's own are `eval:academy`); `held` = the same in words for the card; `clear` = how far (map units) lots keep from it
 * (the arena is ~80 × 64 units wide). Each has a road node `venue:<id>`. Display only: they change no travel and no match rule.
 */
const VENUES = {
  arena: {
    name: 'League Arena',
    at: [720, 160],
    region: 'wei',
    kind: 'arena',
    clear: 52,
    holds: ['cup', 'eval:wei'],
    held: ['U21 Final Cup', 'Wei evaluations']
  },
  hall: {
    name: 'Academy Hall',
    at: [580, 510],
    region: 'open',
    kind: 'hall',
    clear: 20,
    holds: ['eval:academy'],
    held: ['Academy evaluations']
  },
  beach: { name: 'Beach Stadium', at: [925, 450], region: 'wu', kind: 'stadium', clear: 22, holds: ['eval:wu'], held: ['Wu evaluations'] },
  highland: {
    name: 'Highland Court',
    at: [400, 180],
    region: 'shu',
    kind: 'hillcourt',
    clear: 26,
    holds: ['eval:shu'],
    held: ['Shu evaluations']
  }
};
/**
 * The road network (spec §4.18): nodes by id → [x, y] (all on land) and edges [a, b, kind]. Nodes sit at the airport
 * (`airport`), every SPOTS place with an `at` (same id), every club HQ (`hq0`…`hq7`), each housing's home spot (`home:<key>`,
 * see HOME_AT), the four official venues (`venue:<id>`, VENUES) and the junctions (`j…`). kind: `main` (Wu coast road, Wei avenues, Academy roads), `street` (Wei grid),
 * `dirt` (Shu, Outlaws), `path` (Shu mountain trails, temple steps), `boardwalk` (the sand strip along the dune line), `overpass` (the elevated highway, downtown Wei → the harbor). Plain data: City.route walks it, MapModel draws and
 * settles it.
 */
const ROADS = {
  nodes: {
    airport: [470, 600],
    // Wu: the coast road, east round to the harbor
    'home:studio': [430, 622],
    sand: [560, 632],
    pier: [615, 646],
    bonfire: [680, 622],
    hotelWu: [735, 525],
    jWu1: [840, 520],
    jWu2: [885, 455],
    harbor: [935, 385],
    hq2: [940, 310],
    dunes: [975, 240],
    wuVillage: [905, 225],
    hq3: [620, 510],
    // the boardwalk along the dune line, and the old resort strip at its end
    jBw1: [515, 626],
    jBw2: [615, 626],
    jBw3: [760, 598],
    'venue:beach': [925, 450],
    jBw4: [830, 572],
    jBw5: [890, 535],
    resort: [908, 488],
    // the overpass: downtown Wei to the harbor, over the Outlaws patch
    jO1: [845, 390],
    jO2: [865, 440],
    // Central Academy and its roads
    park: [540, 500],
    'venue:hall': [580, 510],
    jAc1: [575, 415],
    jAc2: [505, 555],
    // Wei: avenues and the grid
    weiPower: [615, 330],
    weiSpeed: [760, 330],
    weiWit: [680, 410],
    weiJump: [575, 185],
    hotelWei: [820, 290],
    noodles: [720, 380],
    arcade: [620, 262],
    hq0: [640, 210],
    'venue:arena': [720, 160],
    hq1: [610, 400],
    'home:dorm': [640, 440],
    'home:condo': [760, 395],
    'home:homeless': [600, 115],
    jW1: [680, 330],
    jW2: [840, 330],
    jW3: [700, 300],
    jWn: [600, 150],
    // the minors
    gloria: [735, 275],
    hq6: [700, 262],
    cage: [845, 455],
    street: [785, 490],
    hq5: [790, 465],
    // Shu: dirt roads and mountain paths
    dojo: [395, 360],
    stone: [420, 475],
    jSs: [430, 530],
    shrine: [320, 410],
    hq7: [230, 400],
    'home:highland': [180, 330],
    trail: [215, 290],
    jSh: [280, 280],
    hutNoodles: [350, 290],
    hq4: [360, 220],
    'venue:highland': [400, 180],
    steps: [320, 235],
    hotelShu: [410, 250],
    jSn: [490, 215]
  },
  edges: [
    // Wu coast road and the way up to Wei
    ['airport', 'home:studio', 'main'],
    ['hq3', 'hotelWu', 'main'],
    ['hotelWu', 'jWu1', 'main'],
    ['jWu1', 'jWu2', 'main'],
    ['jWu2', 'harbor', 'main'],
    ['harbor', 'hq2', 'main'],
    ['hq2', 'dunes', 'main'],
    // Wu is weakly connected (spec §4.19): only the coast road is `main` between its settlements, the rest are dirt tracks
    ['hotelWu', 'jBw3', 'dirt'],
    ['hq2', 'wuVillage', 'dirt'],
    ['hq3', 'home:dorm', 'main'],
    // the boardwalk (sand ↔ pier ↔ bonfire ↔ the resort strip)
    ['airport', 'jBw1', 'boardwalk'],
    ['jBw1', 'sand', 'boardwalk'],
    ['sand', 'jBw2', 'boardwalk'],
    ['jBw2', 'pier', 'boardwalk'],
    ['jBw2', 'bonfire', 'boardwalk'],
    ['bonfire', 'jBw3', 'boardwalk'],
    ['jBw3', 'jBw4', 'boardwalk'],
    ['jBw4', 'jBw5', 'boardwalk'],
    ['jBw5', 'resort', 'boardwalk'],
    ['resort', 'venue:beach', 'boardwalk'],
    // the overpass (elevated)
    ['jW2', 'jO1', 'overpass'],
    ['jO1', 'jO2', 'overpass'],
    ['jO2', 'jWu2', 'overpass'],
    ['home:dorm', 'hq1', 'main'],
    ['hq1', 'weiPower', 'main'],
    // Central Academy roads
    ['airport', 'jAc2', 'main'],
    ['jAc2', 'jAc1', 'main'],
    ['jAc1', 'park', 'main'],
    ['park', 'weiPower', 'main'],
    ['park', 'stone', 'main'],
    ['park', 'venue:hall', 'main'],
    // Wei avenues and grid
    ['weiPower', 'jW1', 'main'],
    ['jW1', 'weiSpeed', 'main'],
    ['weiSpeed', 'jW2', 'main'],
    ['jW2', 'hotelWei', 'street'],
    ['weiPower', 'arcade', 'main'],
    ['arcade', 'hq0', 'main'],
    ['hq0', 'venue:arena', 'main'],
    ['hq0', 'weiJump', 'main'],
    ['weiJump', 'jWn', 'main'],
    ['jWn', 'home:homeless', 'street'],
    ['jW1', 'weiWit', 'street'],
    ['weiWit', 'noodles', 'street'],
    ['noodles', 'home:condo', 'street'],
    ['home:condo', 'weiSpeed', 'street'],
    ['weiWit', 'home:dorm', 'street'],
    ['jW1', 'jW3', 'street'],
    ['jW3', 'hq6', 'street'],
    ['hq6', 'arcade', 'street'],
    ['hq6', 'gloria', 'street'],
    ['gloria', 'hotelWei', 'street'],
    ['jW3', 'weiSpeed', 'street'],
    // the Outlaws, under the overpass
    ['home:condo', 'hq5', 'dirt'],
    ['jWu1', 'street', 'dirt'],
    ['street', 'hq5', 'dirt'],
    ['hq5', 'cage', 'dirt'],
    ['cage', 'jWu2', 'dirt'],
    // Shu: dirt roads, mountain trails, temple steps
    ['dojo', 'shrine', 'dirt'],
    ['dojo', 'stone', 'dirt'],
    ['stone', 'jSs', 'dirt'],
    ['jSs', 'home:studio', 'dirt'],
    ['shrine', 'hq7', 'dirt'],
    ['hq7', 'home:highland', 'dirt'],
    ['home:highland', 'trail', 'path'],
    ['trail', 'jSh', 'path'],
    ['jSh', 'hutNoodles', 'path'],
    ['hutNoodles', 'dojo', 'dirt'],
    ['hutNoodles', 'hq4', 'dirt'],
    ['hq4', 'steps', 'path'],
    ['hq4', 'hotelShu', 'dirt'],
    ['hq4', 'venue:highland', 'dirt'],
    ['hotelShu', 'dojo', 'dirt'],
    ['hotelShu', 'jSn', 'dirt'],
    ['jSn', 'weiJump', 'main']
  ]
};
/**
 * How each region is settled (MapModel.lots, along its roads): style = the look; gap = map units between lots along a road;
 * density = share of the slots that are built (a hash of the slot decides); setback = distance of a lot's centre from the road
 * (both sides); size = a lot's side; kinds = the building kinds the style mixes.
 */
const SETTLE = {
  wei: { style: 'city', density: 0.85, gap: 8, setback: 8, size: 6, kinds: ['block', 'block', 'tower', 'shop'] },
  wu: { style: 'fishing', density: 0.7, gap: 10, setback: 7, size: 5, kinds: ['hut', 'hut', 'shed', 'boathouse'] },
  shu: { style: 'terrace', density: 0.6, gap: 11, setback: 7, size: 5, kinds: ['house', 'house', 'barn'] },
  open: { style: 'campus', density: 0.7, gap: 14, setback: 11, size: 8, kinds: ['hall', 'hall', 'dorm'] },
  outlaws: { style: 'shacks', density: 0.8, gap: 8, setback: 6, size: 4.5, kinds: ['shack', 'shack', 'container'] },
  gloria: { style: 'compound', density: 0.7, gap: 12, setback: 9, size: 8, kinds: ['villa', 'villa', 'gatehouse'] }
};
/**
 * Districts (spec §4.19): areas the settlement fills with a grid of lots (MapModel.lots), listed smallest first (earlier ones keep
 * their ground). poly = a polygon or `{ x, y, r }` (a circle); region = the region the lots must stand in (`CITY` minors and the
 * Academy park count as regions); gap = grid spacing (map units); density = share of the grid that is built (a hash decides);
 * size = a lot's side; kinds = the building kinds mixed;
 * beach = the lots stand only on the sand (all others never do). Ids, not names: old-language names wait for lore §8.
 */
const DISTRICTS = [
  {
    id: 'wei-downtown',
    region: 'wei',
    style: 'city',
    poly: { x: 640, y: 225, r: 85 },
    gap: 9,
    density: 0.9,
    size: 6,
    kinds: ['tower', 'tower', 'block', 'shop']
  },
  {
    id: 'wei-oldtown',
    region: 'wei',
    style: 'oldtown',
    poly: { x: 590, y: 112, r: 58 },
    gap: 8,
    density: 0.65,
    size: 4.5,
    kinds: ['rowhouse', 'rowhouse', 'rowhouse', 'shop', 'market']
  },
  {
    id: 'gloria',
    region: 'gloria',
    style: 'compound',
    poly: { x: 690, y: 255, r: 58 },
    gap: 11,
    density: 1,
    size: 6,
    kinds: ['villa', 'villa', 'gatehouse']
  },
  {
    id: 'outlaws',
    region: 'outlaws',
    style: 'shacks',
    poly: { x: 815, y: 470, r: 80 },
    gap: 9,
    density: 0.8,
    size: 4.5,
    kinds: ['shack', 'shack', 'container', 'workshop']
  },
  {
    id: 'academy',
    region: 'open',
    style: 'campus',
    poly: { x: 540, y: 500, r: 60 },
    gap: 13,
    density: 0.7,
    size: 7,
    kinds: ['hall', 'hall', 'dorm']
  },
  {
    id: 'shu-village-west',
    region: 'shu',
    style: 'terrace',
    poly: { x: 205, y: 365, r: 48 },
    gap: 9,
    density: 0.62,
    size: 4.5,
    kinds: ['terrace', 'terrace', 'house', 'barn']
  },
  {
    id: 'shu-village-north',
    region: 'shu',
    style: 'terrace',
    poly: { x: 345, y: 225, r: 48 },
    gap: 9,
    density: 0.62,
    size: 4.5,
    kinds: ['terrace', 'terrace', 'house', 'barn']
  },
  {
    id: 'shu-village-south',
    region: 'shu',
    style: 'terrace',
    poly: { x: 355, y: 390, r: 48 },
    gap: 9,
    density: 0.62,
    size: 4.5,
    kinds: ['terrace', 'house', 'house', 'barn']
  },
  {
    id: 'shu-village-trail',
    region: 'shu',
    style: 'terrace',
    poly: { x: 215, y: 285, r: 34 },
    gap: 9,
    density: 0.62,
    size: 4.5,
    kinds: ['terrace', 'house', 'barn']
  },
  {
    id: 'wu-harbor',
    region: 'wu',
    style: 'fishing',
    poly: { x: 925, y: 360, r: 70 },
    gap: 9,
    density: 0.8,
    size: 5,
    kinds: ['warehouse', 'warehouse', 'shed', 'boathouse', 'hut']
  },
  {
    id: 'wu-village',
    region: 'wu',
    style: 'fishing',
    poly: { x: 905, y: 225, r: 34 },
    gap: 9,
    density: 0.8,
    size: 4.5,
    kinds: ['hut', 'hut', 'shed', 'house']
  },
  {
    id: 'wu-town',
    region: 'wu',
    style: 'fishing',
    poly: [
      [540, 505],
      [610, 455],
      [738, 475],
      [855, 425],
      [905, 470],
      [870, 520],
      [800, 555],
      [700, 580],
      [600, 590],
      [545, 585]
    ],
    gap: 9,
    density: 0.85,
    size: 5,
    kinds: ['barracks', 'workshop', 'market', 'hut', 'shed', 'house']
  },
  {
    id: 'wu-beach',
    region: 'wu',
    style: 'beach',
    beach: true,
    poly: 'beach',
    gap: 15,
    density: 0.6,
    size: 5,
    kinds: ['resort', 'kiosk', 'kiosk', 'resort']
  },
  {
    id: 'wei-ring',
    region: 'wei',
    style: 'city',
    poly: 'wei',
    gap: 12,
    density: 0.55,
    size: 6.5,
    kinds: ['block', 'block', 'tower', 'shop', 'workshop']
  }
];
/**
 * Wealth (spec §4.19), 0–1 per lot, from fixed data + hashes (MapModel.lots): it drives a lot's size, spacing, height and look.
 * Wei: `weiFloor` + (1 − weiFloor) × (1 − smoothstep(0, `weiEdge`, distance from `weiCore`)) — rich downtown, a steady fall to the
 * suburbs, no rich pockets (but the Gloria compound) — plus a ±`jitter` hash; Old Town is capped at `oldtown`. Elsewhere a region
 * base ± `spread`: Gloria `gloria`, Wu `wu` (even, modest), Shu `shu`, the Outlaws `outlaws` (poorest), the Academy `academy`.
 */
const WEALTH = {
  weiCore: [650, 260],
  weiEdge: 280,
  weiFloor: 0.15,
  oldtown: 0.15,
  jitter: 0.08,
  spread: 0.1,
  gloria: 0.95,
  wu: 0.5,
  shu: 0.2,
  outlaws: 0.05,
  academy: 0.55
};
/** Landmark kind of every place (SPOTS id) and club HQ (`hq`). */
const LANDMARK = {
  weiPower: 'gym',
  weiSpeed: 'gym',
  weiWit: 'gym',
  weiJump: 'gym',
  gloria: 'gym',
  sand: 'court',
  dunes: 'court',
  harbor: 'gym',
  pier: 'court',
  trail: 'court',
  steps: 'shrine',
  dojo: 'dojo',
  stone: 'gym',
  shrine: 'shrine',
  cage: 'cage',
  park: 'campus',
  home: 'home',
  hotelWei: 'hotel',
  hotelWu: 'hotel',
  hotelShu: 'hotel',
  noodles: 'stall',
  hutNoodles: 'stall',
  arcade: 'stall',
  bonfire: 'stall',
  street: 'court',
  hq: 'hq'
};
