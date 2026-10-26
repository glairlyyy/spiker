// The island map, all claimed: Wei the city (north and east), Wu the beach (the east and south coast) and a strip
// inland, Shu the highlands (west); Central Academy in the middle belongs to nobody, by common respect;
// the minors sit as borderless patches inside or across them. You arrive at the airport on the south coast.
// Coordinates are written in design units (1060 × 700) and scaled once at load by MAP_SCALE (scaleMap at the end of this
// file): the island is MAP_SCALE × wider and taller, its towns keep their size and density. Names are placeholders.

/**
 * The island's scale (owner, 2026-10-03: 1.5; owner, 2026-10-05: × 1.5 again = 2.25 — more room between the same towns; owner,
 * 2026-10-23: × 2 = 4.5 — the whole 2.25 layout spread out twice, towns and districts too: spec §4.40).
 */
const MAP_SCALE = 4.5;
/** The 2.25 island (§4.18b) that MAP_SCALE spreads uniformly × MAP_SCALE / MAP_BASE (scaleMap). */
const MAP_BASE = 2.25;
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
    /** Wei's city: its east and south sides are the Wei–Wu line. */
    wei: [...coast.slice(3, 7), ...wuWei, ...shuWei.slice(1).reverse()],
    /** The Wei–Wu line (the dry side of the sand test; the war's front is the hex frontier, spec §4.27). */
    weiWu: wuWei,
    /** The inland strip's two points on the Wu side of Central Academy (the sand test's dry polygon uses them). */
    strip: [
      [430, 540],
      [540, 500]
    ],
    /** The beach: the east coast round to the south (coast points 6–12; the sand is between them and `dunes`). */
    beach: coast.slice(6, 13),
    /** Wu: the beach and the land behind it up to Wei, plus a strip inland in the south. */
    wu: [...coast.slice(6, 13), [430, 540], [540, 500], ...wuWei.slice().reverse()],
    /** Shu's highlands: the whole west, coast to coast. */
    shu: [...coast.slice(12), ...coast.slice(0, 4), ...shuWei.slice(1), [430, 540]],
    /**
     * Central Academy: neutral ground at the tri-point of Wei, Wu and Shu (north of the airport). x, y = its middle; r = the
     * campus core, which keeps its size when the map scales (scaleMap). The region is wider: the hex tiles within ACADEMY.ring.
     */
    park: { x: 540, y: 500, r: 60 },
    /** The old ritual ground's sand circle, by the Academy (a landmark with no pin and no label). */
    ritual: [595, 548],
    /** Borderless minors: ellipses { x, y, rx, ry, rot }. */
    minors: {
      outlaws: { x: 815, y: 470, rx: 78, ry: 42, rot: -35 },
      gloria: { x: 690, y: 255, rx: 58, ry: 40, rot: 10 }
    },
    /** Region label anchors. */
    label: { open: [545, 432], wei: [800, 345], shu: [300, 300], wu: [680, 545], outlaws: [835, 500], gloria: [690, 222] },
    /** The airport's terminal: where you arrive (the runway lies seaward of it, AIRPORT). */
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
    /**
     * The Shu highlands' shape (owner, 2026-10-05; reliefAt): the Peak — the island's highest point, NW above Shu · Peak —,
     * the Spine — the ridge running south from it (the dragon's back the Shu clubs are named for: Peak on its high side,
     * Valley below) — and the river that comes down off the Peak into the reservoir and on to the south coast, carving the
     * valley. Heights in metres; r / w in design units. Display (terrain) and the cost of crossing rough ground.
     */
    relief: {
      peak: { at: [262, 178], h: 110, r: 120 },
      spine: {
        line: [
          [262, 178],
          [305, 262],
          [338, 330],
          [372, 410],
          [402, 488]
        ],
        h: [55, 14],
        w: 34
      },
      river: {
        line: [
          [250, 236],
          [262, 300],
          [280, 367],
          [274, 430],
          [282, 520],
          [290, 600]
        ],
        d: 7,
        w: 26
      }
    }
  };
})();

/** Central Academy's region (spec §4.18e): every hex tile within `ring` steps of the tile at its middle. */
const ACADEMY = { ring: 1 };
/**
 * The airport (spec §4.18d): one landmark at the terminal (CITY.airport) on a fixed heading. yaw = the landmark's turn (its
 * +z points seaward, its +x east along the shore); box = its footprint [u0, v0, u1, v1] in map units on those axes (u along
 * the shore, v seaward): lots keep off it. runway = the plane's take-off on those axes (TRAFFIC): rolls from u `from` to `lift`, climbs out to `to`, at v. The 3D layout (runway, apron, terminal, tower) is kit3d's `airport`.
 */
const AIRPORT = { yaw: -0.133, box: [-150, -22, 30, 46], runway: { from: 14, lift: -100, to: -420, v: 30 } };

// ---- Days, hours, fees and travel (tuning) ----
/** Days in a training week (spec §4.41: each a day of hours on the map; the week ends when you sleep through day 7). */
const WEEK_DAYS = 7;
/** The old one-action day's session as a fraction of the week-long one: gains and skill points × (a session's hours scale it, HOURS). */
const DAY_GAIN = 0.25;
/**
 * The day in hours (spec §4.41): `run.clock` = { day 1–7 (8: the week spent), hour (07 = 7; past midnight 24 +), log (today's
 * blocks) }. wake: the week's first morning; late: 02:00 — nothing starts past it, and an action that ends past it puts you to
 * sleep where you stand (`nod` h, × `nodMul`, mood down); match: the hour a match you are made to play starts (`matchH` long);
 * act: the hours of a one-off thing (a match you choose, a scout, an outing); sleep: the share of the missing stamina each length
 * brings back (× your home's rest, capped at all of it), `sleepMood` its mood.
 */
const DAY = {
  wake: 7,
  late: 26,
  nod: 4,
  nodMul: 0.6,
  match: 13,
  matchH: 2,
  act: 2,
  sleep: { 4: 0.45, 6: 0.75, 8: 1 },
  sleepMood: { 4: -1 },
  sleepH: [4, 6, 8]
};
/**
 * A session's hours (spec §4.41): `opts` for drills and work (Stretch: `stretch`); `unit` = what 2 h are worth in old day
 * sessions (gains, price, pay, skill points, facility uses — linear in the hours); `sta[h]` × the order's stamina × `staK` (each
 * hour costs more than the last); `fail[h]` added to the fail chance; `inj[h]` the injury chance of a failed session on top of
 * the low-stamina one.
 */
const HOURS = {
  opts: [2, 3, 4],
  stretch: [1, 2, 3],
  unit: 0.32,
  run: 0.4,
  staK: 2.6,
  sta: [0, 0.45, 1, 1.6, 2.3],
  fail: [0, 0, 0, 0.04, 0.1],
  inj: [0, 0, 0, 0.15, 0.3]
};
/** Walking: travel cost (City.path) an hour — one old trip day ≈ 2 h (spec §4.41); a run covers RUN_PACE × that. */
const WALK_PACE = (220 * MAP_BASE) / 2,
  RUN_PACE = 1.5;
/** A training session's fee before the region's price (one day's session). */
const TRAIN_FEE = 8;
/** Home turf: training in your own faction's region gives this bonus. */
const TURF_BONUS = 0.1;
/** Sand courts: technique training — skill points from a session ×. */
const SAND_SP = 2;
/** A night at a hotel away from home: base price (× the region's price). */
const HOTEL = { price: 12, rest: 1 };
/**
 * Travel (spec §4.18, T-048; hours since §4.41): the route's cost ÷ WALK_PACE hours, 1 h at least (City.trip). The cost is
 * the cheaper of going cross-country (straight distance × 1) and the road route (the legs to / from the network × 1, each road
 * edge's length × ROAD_COST[kind]): main roads and the overpass are fast, Shu mountain paths are slower than the open ground.
 */
const ROAD_COST = { main: 0.45, overpass: 0.35, street: 0.6, boardwalk: 0.7, dirt: 0.8, path: 1.2 };
/**
 * Access lanes (owner, 2026-10-26: every building fronts a road — MapModel.laneData): a lot farther than `reach` (map units, 25 m) from
 * every road gets a lane along its grid row; every `every`-th row of a district's lot grid is the lane, runs of lots up to `join` cells
 * apart share one; lanes keep `clear` from places, HQs, homes and venues; a connector longer than `reachMax` is not built (those lots
 * are left out instead); kind by region (the beach: boardwalk).
 */
const LANES = {
  reach: 50,
  reachMax: 700,
  every: 5,
  join: 3,
  clear: 30,
  kind: { wei: 'street', wu: 'street', open: 'street', gloria: 'street', shu: 'dirt', outlaws: 'dirt', beach: 'boardwalk' }
};
/** Going cross-country (off the roads) costs this × the distance by region (the Shu highlands are rough ground); others 1. */
const GROUND_COST = { shu: 1.35 },
  /** …and × (1 + height / RELIEF_COST) up the Peak and the Spine (reliefAt): going over the ridge costs more than the valley road. */
  RELIEF_COST = 60,
  /** A hex whose centre stands higher than this (m, reliefAt) is highland terrain (spec §4.27). */
  HIGHLAND_M = 18,
  GROUND_STEP = 20 * MAP_SCALE;
/** The old trip day's travel cost (spec §4.40): what a Run's ground gains and stamina are measured in (RUN_GROUND); 2 h on foot (WALK_PACE). */
const TRIP_DAY = 220 * MAP_BASE;
/** You stand at a point closer than this (map units): no walk. */
const HERE_R = 2;
/** The dark map: each point you've stood on lights up this radius. */
const REVEAL_R = 170 * MAP_SCALE;

/**
 * Places. Each takes its hours (+ the walk there; `hours`: an outing's own, else DAY.act; orders: HOURS). act: what a non-training place does (rest, rec, or an outing: ramen,
 * arcade, street). kit: its equipment and ground (KITS tags, spec §4.33) — each tag brings day orders; `train` (the lead
 * training, read by NPC plans and the dossier) is derived from the first tag below. lv: a fixed facility level. region: see
 * REGIONS (null = your home: goes with your housing). cost: money for an outing (× the region's price). sand: technique training (SAND_SP).
 */
const SPOTS = {
  // Wei — the city: premium, pricey, maybe overhyped
  weiPower: { name: 'Dynasty Strength Center', kit: ['weights', 'mats'], region: 'wei', at: [655, 315], icon: '🏋' },
  weiSpeed: { name: 'Dome Sprint Lab', kit: ['track', 'mats'], region: 'wei', at: [705, 315], icon: '🏃' },
  weiWit: { name: 'Academy Film Library', kit: ['film'], region: 'wei', at: [655, 350], icon: '🎞' },
  weiJump: { name: 'Skytower Plyo Gym', kit: ['plyo', 'weights'], region: 'wei', at: [705, 350], icon: '🏀' },
  gloria: { name: 'St. Gloria Private Club', kit: ['mats', 'water'], region: 'gloria', at: [735, 275], icon: '💎' },
  // Wu — the coast: mid everything; sand courts build technique
  sand: { name: 'Sand Courts', kit: ['sand', 'mats'], region: 'wu', sand: true, at: [790, 600], icon: '🏖' },
  dunes: { name: 'Dune Sprints', kit: ['dunes', 'sand'], region: 'wu', at: [975, 240], icon: '🌊' },
  harbor: { name: 'Harbor Gym', kit: ['weights', 'crates'], region: 'wu', at: [935, 385], icon: '⚓' },
  pier: { name: 'Pier Jump Deck', kit: ['plyo', 'water'], region: 'wu', sand: true, at: [535, 645], icon: '🪂' },
  // Shu — the highlands: cheap and rough, far from everything
  trail: { name: 'Mountain Trail', kit: ['trail'], region: 'shu', at: [215, 290], icon: '⛰' },
  steps: { name: 'Thousand Steps', kit: ['steps'], region: 'shu', at: [320, 235], icon: '🛕' },
  dojo: { name: 'Highland Dojo', kit: ['mats', 'chores'], region: 'shu', at: [395, 360], icon: '🥋' },
  stone: { name: 'Stone Gym', kit: ['weights', 'crates'], region: 'shu', at: [420, 475], icon: '🪨' },
  shrine: { name: 'Shrine Library', kit: ['books', 'mats'], region: 'shu', at: [320, 410], icon: '📜' },
  // the minors and Central Academy
  cage: { name: 'Overpass Cage', kit: ['weights'], region: 'outlaws', at: [845, 455], icon: '⛓' },
  acaGym: {
    name: 'Academy Gym',
    kit: ['gym', 'mats', 'chores'],
    lv: 1, // a fixed facility level: the Academy keeps it basic
    region: 'open',
    at: [490, 460],
    icon: '🏫',
    desc: 'The basic gym every student may use: a little of everything, a mat to stretch on, floors to mop for pocket money.'
  },
  park: {
    name: 'Academy Grounds',

    act: 'rec',
    region: 'open',
    at: [540, 500],
    icon: '🏛',
    desc: 'Campus lawns, open to every student. Mood up, +10 stamina.'
  },
  home: { name: 'Home', act: 'rest', region: null, icon: '🏠', desc: 'Sleep 4, 6 or 8 h: the day ends (× how well you sleep there)' },
  // hotels: a night's rest away from home, at the region's price
  hotelWei: {
    name: 'City Hotel',

    act: 'rest',
    hotel: true,
    region: 'wei',
    at: [820, 290],
    icon: '🏨',
    desc: 'Sleep at a hotel'
  },
  hotelWu: { name: 'Seaside Inn', act: 'rest', hotel: true, region: 'wu', at: [735, 525], icon: '🏨', desc: 'Sleep at an inn' },
  hotelShu: {
    name: 'Mountain Lodge',

    act: 'rest',
    hotel: true,
    region: 'shu',
    at: [410, 250],
    icon: '🏨',
    desc: 'Sleep at a lodge'
  },
  // evenings
  noodles: {
    name: 'Noodle Bar',

    act: 'ramen',
    region: 'wei',
    at: [720, 380],
    icon: '🍜',
    cost: 15,
    desc: 'Dinner with a teammate: +6 bond, +10 stamina'
  },
  hutNoodles: {
    name: 'Mountain Noodles',

    act: 'ramen',
    region: 'shu',
    at: [350, 290],
    icon: '🍲',
    cost: 15,
    desc: 'Dinner with a teammate: +6 bond, +10 stamina'
  },
  arcade: {
    name: 'Neon Arcade',

    act: 'arcade',
    region: 'wei',
    at: [620, 262],
    icon: '🕹',
    cost: 15,
    desc: 'Night out with the team: mood up, +3 bond with everyone'
  },
  bonfire: {
    name: 'Beach Bonfire',

    act: 'arcade',
    region: 'wu',
    at: [680, 622],
    icon: '🔥',
    cost: 15,
    desc: 'Night out with the team: mood up, +3 bond with everyone'
  },
  street: {
    name: 'Overpass Court',

    act: 'street',
    region: 'outlaws',
    at: [785, 490],
    icon: '💵',
    desc: 'Street hustle for cash: win on your OVR, −12 stamina'
  },
  // secret places (spec §4.31): `secret` = off the map until someone tells you (Secret.known); act = what Secret.day does there
  tapes: {
    name: 'The Tape Room',
    act: 'tapes',
    secret: true,
    region: 'open',
    at: [500, 472],
    icon: '📼',
    desc: "The Academy basement: old scouting tapes. Fern's key."
  },
  light: {
    name: 'The Lighthouse',
    act: 'light',
    secret: true,
    region: 'wu',
    at: [960, 222],
    icon: '🗼',
    desc: 'Past the Wu docks. Where Fern went when she wanted to quit.'
  },
  hermit: {
    name: "The Hermit's Court",
    act: 'hermit',
    secret: true,
    region: 'shu',
    at: [300, 218],
    icon: '🏯',
    desc: 'An old national player past the Thousand Steps. He turns everyone away.'
  },
  roof: {
    name: "Fern's Rooftop",
    act: 'roof',
    secret: true,
    region: 'open',
    at: [496, 540],
    icon: '✉',
    desc: 'The roof of the student flat. Her letters come here.'
  },
  onsen: {
    name: 'The Onsen',
    act: 'onsen',
    secret: true,
    region: 'shu',
    at: [240, 270],
    icon: '♨',
    cost: 30,
    hours: 6,
    desc: 'A hot spring in the hills. The one luxury worth it. Six hours: full stamina, mood Great, an injury heals a week sooner.'
  },
  midnight: {
    name: 'The Midnight Court',
    act: 'midnight',
    secret: true,
    region: 'outlaws',
    at: [800, 478],
    icon: '🌙',
    desc: 'Under the overpass, off the record. The aces practise here when nobody is looking.'
  },
  oldScout: {
    name: 'The Old Scout',
    act: 'oldScout',
    secret: true,
    region: 'wei',
    at: [745, 312],
    icon: '☕',
    desc: 'A café in Wei. A retired scout who still rates everyone — honestly, once a month.'
  },
  // the harbor's market (spec §4.42): a bike or a scooter for sale (TRANSPORT)
  market: {
    name: 'Harbor Market',
    act: 'ride',
    region: 'wu',
    at: [900, 372],
    icon: '🚲',
    desc: 'Fish at dawn, everything else by noon. A stall of rebuilt bikes and scooters off the mainland boats.'
  },
  // the airport's freight (spec §4.38, T-339): the Ref drone for sale (DRONE)
  cargo: {
    name: 'Cargo Shed',
    act: 'cargo',
    region: 'wu',
    at: [495, 578],
    icon: '📦',
    desc: 'Mainland freight, league-licensed. The Ref drone: it projects the lines, strings a light net and calls every touch.'
  }
};
/**
 * The Ref drone as an item (spec §4.38, T-339; lore §4): buy one at the Cargo Shed (`buy`, flat: freight prices don't follow the
 * region) or rent one at any court for one match (`rent`). With it, a Pickup game on open ground (City.groundAt). Lazy `run.drone` =
 * { own: 1 } once bought, { rent: 1 } while a rented one waits for its match.
 */
const DRONE = { buy: 400, rent: 40 };
/**
 * Where a pickup game may stand (City.groundAt): clear of a road by `road[kind]` map units (`other` for the rest), of a building lot by
 * its half-size + `lot`; `slope` = the climb (relief m a map unit, over ± `step`) from which open ground is a slope; wind by exposure
 * (`beach`, open `field`, the high ground: `high` + height / 100).
 */
const PICKUP = {
  road: { main: 12, overpass: 12, path: 6, other: 9 },
  lot: 4,
  step: 10,
  slope: 0.15,
  wind: { beach: 0.8, field: 0.6, high: 0.4 }
};
// a place's lead training (its first kit tag's): what NPC plans, the dossier and the floor read (spec §4.33)
for (const s of Object.values(SPOTS)) if (s.kit) s.train = KITS[s.kit[0]].train;
/**
 * The secret places (spec §4.31; js/career/secret.js). tapes: the first viewing's Pain. light: Pain let go / sharpened (+ the next
 * Scar's OP odds, T-291). hermit: the trial bars (your best stat must reach the next one) and the gain past the cap on a pass.
 * roof: a letter every `every` weeks in year 2. onsen: days, price. midnight: Drive / Pain on top of the match's own. oldScout:
 * the fans that bring him to you, sims per rating, once every `every` weeks.
 */
const SECRET = {
  tapes: { pain: 15 },
  light: { let: 30, sharp: 25, op: 0.05 },
  hermit: { bars: [60, 66, 72, 78, 84], gain: 2 },
  roof: { every: 4 },
  onsen: { hours: 6, cost: 30 },
  midnight: { win: 15, loss: 8 },
  oldScout: { fans: 2000, n: 10, every: 4 }
};
/** The week rail's label for a day at a secret place (City.dayWhat). */
const SECRET_DAY = {
  tapes: 'Tapes',
  light: 'Lighthouse',
  hermit: 'Trial',
  roof: 'Letter',
  onsen: 'Onsen',
  midnight: 'Night game',
  oldScout: 'Scout'
};
/** Street hustle tuning: rival OVR range, stake won / lost, fans on a win. */
const STREET = { rival: [35, 60], win: [40, 90], loss: 20, fans: 40, sta: 12 };
/** Scouting a club at its HQ (a day): stamina cost. */
const SCOUT_STA = 5;
/** Where you live on the map, by housing. */
const HOME_AT = { homeless: [600, 115], highland: [180, 330], studio: [484, 532], dorm: [660, 400], condo: [676.7, 213.3] };

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
    cargo: [495, 578],
    market: [900, 372],
    // Wu: the coast road, east round to the harbor
    sand: [790, 600],
    pier: [535, 645],
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
    acaGym: [490, 460],
    'home:studio': [484, 532],
    'venue:hall': [580, 510],
    jAc1: [569.3, 433.3], // the Academy's north gate, on the avenue to Wei
    jAc2: [505, 555],
    // Wei: avenues and the grid; the four gyms stand together in the training district round jW1 (owner, 2026-10-03)
    weiPower: [655, 315],
    weiSpeed: [705, 315],
    weiWit: [655, 350],
    weiJump: [705, 350],
    jWp: [615, 330],
    jWs: [760, 330],
    jWw: [680, 410],
    jWj: [575, 185],
    hotelWei: [820, 290],
    noodles: [720, 380],
    arcade: [620, 262],
    hq0: [640, 210],
    'venue:arena': [720, 160],
    hq1: [610, 400],
    'home:dorm': [660, 400],
    'home:condo': [676.7, 213.3],
    jWc: [760, 395],
    jWk: [826.7, 113.3],
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
    jSn: [490, 215],
    // the secret places (spec §4.31)
    tapes: [500, 472],
    light: [960, 222],
    hermit: [300, 218],
    roof: [496, 540],
    onsen: [240, 270],
    midnight: [800, 478],
    oldScout: [745, 312]
  },
  edges: [
    // Wu coast road and the way up to Wei
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
    ['airport', 'cargo', 'street'], // the freight yard behind the terminal
    ['harbor', 'market', 'street'], // the harbor's market (spec §4.42)
    // the boardwalk (sand ↔ pier ↔ bonfire ↔ the resort strip)
    ['airport', 'jBw1', 'boardwalk'],
    ['jBw1', 'pier', 'boardwalk'],
    ['pier', 'jBw2', 'boardwalk'],
    ['jBw2', 'bonfire', 'boardwalk'],
    ['bonfire', 'jBw3', 'boardwalk'],
    ['jBw3', 'sand', 'boardwalk'],
    ['sand', 'jBw4', 'boardwalk'],
    ['jBw4', 'jBw5', 'boardwalk'],
    ['jBw5', 'resort', 'boardwalk'],
    ['resort', 'venue:beach', 'boardwalk'],
    // the overpass (elevated)
    ['jW2', 'jO1', 'overpass'],
    ['jO1', 'jO2', 'overpass'],
    ['jO2', 'jWu2', 'overpass'],
    ['home:dorm', 'hq1', 'main'],
    ['hq1', 'jWp', 'main'],
    // Central Academy roads
    // airport → the south gate (jAc2) → the campus → the north gate (jAc1) → Wei
    ['airport', 'jAc2', 'main'],
    ['jAc2', 'park', 'main'],
    ['park', 'jAc1', 'main'],
    ['jAc1', 'jWp', 'main'],
    ['park', 'stone', 'main'],
    ['park', 'venue:hall', 'main'],
    ['jAc2', 'home:studio', 'street'],
    ['park', 'acaGym', 'street'],
    // Wei avenues and grid
    ['jWp', 'jW1', 'main'],
    ['jW1', 'jWs', 'main'],
    ['jWs', 'jW2', 'main'],
    ['jW2', 'hotelWei', 'street'],
    ['jWp', 'arcade', 'main'],
    ['arcade', 'hq0', 'main'],
    ['hq0', 'venue:arena', 'main'],
    ['hq0', 'jWj', 'main'],
    ['jWj', 'jWn', 'main'],
    ['jWn', 'home:homeless', 'street'],
    ['jW1', 'jWw', 'street'],
    ['jWw', 'noodles', 'street'],
    ['noodles', 'jWc', 'street'],
    ['jWc', 'jWs', 'street'],
    ['hq0', 'home:condo', 'street'],
    ['venue:arena', 'jWk', 'main'],
    ['jWw', 'home:dorm', 'street'],
    ['jW1', 'jW3', 'street'],
    ['jW3', 'hq6', 'street'],
    ['hq6', 'arcade', 'street'],
    ['hq6', 'gloria', 'street'],
    ['gloria', 'hotelWei', 'street'],
    ['jW3', 'jWs', 'street'],
    // the training district: every Wei gym a short walk from jW1
    ['jW1', 'weiPower', 'street'],
    ['jW1', 'weiSpeed', 'street'],
    ['jW1', 'weiWit', 'street'],
    ['jW1', 'weiJump', 'street'],
    // the Outlaws, under the overpass
    ['jWc', 'hq5', 'dirt'],
    ['jWu1', 'street', 'dirt'],
    ['street', 'hq5', 'dirt'],
    ['hq5', 'cage', 'dirt'],
    ['cage', 'jWu2', 'dirt'],
    // Shu: dirt roads, mountain trails, temple steps
    ['dojo', 'shrine', 'dirt'],
    ['dojo', 'stone', 'dirt'],
    ['stone', 'jSs', 'dirt'],
    ['jSs', 'airport', 'dirt'],
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
    ['jSn', 'jWj', 'main'],
    ['acaGym', 'tapes', 'path'],
    ['dunes', 'light', 'path'],
    ['steps', 'hermit', 'path'],
    ['home:studio', 'roof', 'path'],
    ['trail', 'onsen', 'path'],
    ['street', 'midnight', 'dirt'],
    ['jW3', 'oldScout', 'street']
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
 * beach = the lots stand only on the sand (all others never do); tall = its lots rise with wealth (downtown, the civic core). Ids, not names: old-language names wait for lore §8.
 */
const DISTRICTS = [
  {
    // the civic core (spec §4.19a): league office, the Gazette, sponsor banks — Wei's money and paperwork
    id: 'wei-civic',
    region: 'wei',
    style: 'city',
    tall: true,
    poly: { x: 650, y: 256.7, r: 52 },
    gap: 9,
    density: 0.95,
    size: 6.5,
    kinds: ['office', 'office', 'tower']
  },
  {
    // the North works: the island's power plant, water tanks and the bus depot on Wei's north coast
    id: 'wei-works',
    region: 'wei',
    style: 'works',
    poly: { x: 833.3, y: 100, r: 60 },
    gap: 11,
    density: 0.85,
    size: 7,
    kinds: ['plant', 'tank', 'tank', 'depot', 'stack', 'warehouse']
  },
  {
    id: 'wei-downtown',
    region: 'wei',
    style: 'city',
    tall: true,
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
    // the student quarter: the Academy's outer ring of tiles (spec §4.18e; the region test keeps it inside)
    id: 'academy-quarter',
    region: 'open',
    style: 'campus',
    poly: { x: 540, y: 500, r: 150 },
    gap: 11,
    density: 0.55,
    size: 5,
    kinds: ['dorm', 'house', 'shop', 'dorm']
  },
  {
    // the Ring: where Wei's people live — mid-rise blocks with a corner shop (pocket parks: GROUND)
    id: 'wei-ring-west',
    region: 'wei',
    style: 'city',
    poly: { x: 580, y: 333.3, r: 70 },
    gap: 10,
    density: 0.7,
    size: 6,
    kinds: ['apartment', 'apartment', 'block', 'shop']
  },
  {
    id: 'wei-ring-south',
    region: 'wei',
    style: 'city',
    poly: { x: 740, y: 426.7, r: 80 },
    gap: 10,
    density: 0.7,
    size: 6,
    kinds: ['apartment', 'apartment', 'block', 'shop']
  },
  {
    id: 'wei-ring-east',
    region: 'wei',
    style: 'city',
    poly: { x: 833.3, y: 220, r: 100 },
    gap: 10,
    density: 0.7,
    size: 6,
    kinds: ['apartment', 'apartment', 'block', 'shop']
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
    kinds: ['warehouse', 'warehouse', 'container', 'tank', 'market', 'shed', 'boathouse', 'hut'] // fish quay and market, cargo quay
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
 * Ground use (spec §4.19a): flat patches the terrain is painted with, so the land between towns reads as farmland, water or
 * industry. poly = `{ x, y, r, r0? }` (a circle, or a ring with the hole r0: terraces round a village); x / y in design units
 * (× MAP_SCALE like everything else), r / r0 in map units. kind: see GROUND_KEEP (lots stay off those) and the map's tints.
 */
const GROUND = [
  // Shu: terraced slopes and rice paddies round the villages, a reservoir in the hills, the quarry by the Stone Gym
  { id: 'shu-terrace-west', kind: 'terrace', poly: { x: 205, y: 365, r: 100, r0: 50 } },
  { id: 'shu-terrace-north', kind: 'terrace', poly: { x: 345, y: 225, r: 100, r0: 50 } },
  { id: 'shu-paddy-south', kind: 'paddy', poly: { x: 355, y: 390, r: 105, r0: 50 } },
  { id: 'shu-tea-trail', kind: 'terrace', poly: { x: 215, y: 285, r: 80, r0: 36 } },
  { id: 'shu-reservoir', kind: 'water', poly: { x: 280, y: 366.7, r: 34 } },
  { id: 'shu-quarry', kind: 'quarry', poly: { x: 393.3, y: 466.7, r: 28 } },
  // Wu: workshop yards in Wu town, the harbor's quays, fields behind the dunes
  { id: 'wu-yards', kind: 'yard', poly: { x: 766.7, y: 553.3, r: 35 } },
  { id: 'wu-quay', kind: 'quay', poly: { x: 950, y: 373.3, r: 38 } },
  { id: 'wu-fishquay', kind: 'quay', poly: { x: 956.7, y: 313.3, r: 28 } },
  { id: 'wu-fields', kind: 'field', poly: { x: 666.7, y: 574.7, r: 40 } },
  // Wei: pocket parks in the Ring and downtown, the North works' yard, market gardens on the west edge
  { id: 'wei-park-east', kind: 'park', poly: { x: 820, y: 200, r: 20 } },
  { id: 'wei-park-south', kind: 'park', poly: { x: 740, y: 426.7, r: 16 } },
  { id: 'wei-park-west', kind: 'park', poly: { x: 580, y: 333.3, r: 16 } },
  { id: 'wei-park-downtown', kind: 'park', poly: { x: 706.7, y: 200, r: 20 } },
  { id: 'wei-works-yard', kind: 'yard', poly: { x: 833.3, y: 100, r: 48 } },
  { id: 'wei-fields', kind: 'field', poly: { x: 540, y: 200, r: 45 } },
  // the Academy's playing field; the Outlaws' scrapyard
  { id: 'academy-pitch', kind: 'park', poly: { x: 573.3, y: 466.7, r: 18 } },
  { id: 'outlaws-scrap', kind: 'yard', poly: { x: 826.7, y: 460, r: 28 } }
];
/**
 * City life (spec §4.19a; display only: MapModel.life.traffic → life3d). `lines` drive out and back along ROADS nodes (each pair a
 * road edge): n vehicles spread along the line at `speed` m/s. `boats` circle offshore ({ x, y } design units, r map units). The
 * plane takes off down the runway (AIRPORT.runway) every `plane.every` seconds.
 */
const TRAFFIC = {
  lines: [
    // (the buses run on their timetable: TRANSPORT.bus, spec §4.42)
    // vans: the harbor's goods over the overpass into Wei; the North works' run downtown
    { id: 'van-overpass', kind: 'van', n: 3, speed: 8, nodes: ['harbor', 'jWu2', 'jO2', 'jO1', 'jW2', 'jWs', 'jW1', 'jWp'] },
    { id: 'van-works', kind: 'van', n: 1, speed: 7, nodes: ['jWk', 'venue:arena', 'hq0', 'arcade', 'jWp'] }
  ],
  boats: [
    { id: 'boats-east', x: 1020, y: 373.3, r: 35, n: 2 },
    { id: 'boats-south', x: 633.3, y: 686.7, r: 30, n: 2 }
  ],
  plane: { every: 45 }
};
/**
 * Transport (spec §4.42; first guesses — tune here): ways to cross the island in fewer hours than walking, each a cost or a
 * choice; Travel shows those that work for a trip and never picks one for you. Paces are × walking (City.walkH's WALK_PACE) on the
 * legs they ride; every other leg is walked (Shu's highlands — its roads and mountain paths — always: `foot`). Hours of a trip are
 * rounded to `round` h, `min` h at least. `skip`: the ways that pass the road stops by (§4.37 encounters); The bike trains: a
 * `run` share of a run's ground gains (Endurance only) for a `sta` share of its stamina. Stops and piers are ROADS node ids.
 * - bus: Wei runs it — `pace` on its lines' roads; departs every stop every `every` h from `first` to `last`; `fare` a ride
 *   (a transfer at a shared stop is a second ride); standing with `region` ≤ `double` doubles the fare, ≤ `refuse`: no ride.
 * - bike / scooter: bought once at the Harbor Market (`price`); ridden on roads (not mountain paths, not Shu); the scooter burns
 *   `fuel` $ an hour of riding (whole hours, rounded up).
 * - ferry: the coast boat — `pace` along `sea` (design units, scaled with the map: offshore points from the airport pier round to
 *   the harbor; `piers` index into it); departs every pier every `every` h from `first` to `last`; `fare` a crossing.
 * - taxi: door to door at `pace`, both ends in Wei's city; `base` + `perH` $ an hour of walking saved; standing with `region`
 *   ≤ `double` doubles the fare (a taxi never refuses).
 * Lazy `run.ride` = { bike: 1, scooter: 1 } once bought (spec §4.42).
 */
const TRANSPORT = {
  ways: ['bus', 'bike', 'scooter', 'ferry', 'taxi'],
  round: 0.5,
  min: 1,
  skip: ['bus', 'ferry', 'taxi'],
  foot: ['path', 'steps', 'ground'],
  bus: {
    name: 'Bus',
    pace: 3,
    fare: 3,
    first: 6,
    last: 23,
    every: 0.5,
    region: 'wei',
    double: -20,
    refuse: -50,
    // lines along the main roads and the overpass (each consecutive pair a ROADS edge); stops = where it halts (the shelters)
    lines: [
      {
        id: 'bus-academy',
        name: 'Academy line',
        nodes: ['airport', 'jAc2', 'park', 'jAc1', 'jWp', 'arcade', 'hq0', 'venue:arena'],
        stops: ['airport', 'jAc2', 'park', 'jAc1', 'jWp', 'arcade', 'hq0', 'venue:arena']
      },
      {
        id: 'bus-coast',
        name: 'Coast line',
        nodes: ['jWp', 'hq1', 'home:dorm', 'hq3', 'hotelWu', 'jWu1', 'jWu2', 'harbor', 'hq2', 'dunes'],
        stops: ['jWp', 'hq1', 'home:dorm', 'hq3', 'hotelWu', 'jWu1', 'jWu2', 'harbor', 'hq2', 'dunes']
      },
      {
        id: 'bus-overpass',
        name: 'Overpass line',
        nodes: ['jWp', 'jW1', 'jWs', 'jW2', 'jO1', 'jO2', 'jWu2', 'harbor'],
        stops: ['jWp', 'jW1', 'jWs', 'jW2', 'jWu2', 'harbor']
      }
    ],
    names: {
      airport: 'Airport',
      jAc2: 'Academy South Gate',
      park: 'Academy',
      jAc1: 'Academy North Gate',
      jWp: 'Ring West',
      arcade: 'Arcade',
      hq0: 'Gold Tower',
      'venue:arena': 'League Arena',
      hq1: 'Iron Yard',
      'home:dorm': 'Dorms',
      hq3: 'Fort Gate',
      hotelWu: 'Seaside Inn',
      jWu1: 'Wu Town',
      jWu2: 'Overpass Foot',
      harbor: 'Harbor',
      hq2: 'Harbor Hall',
      dunes: 'The Dunes',
      jW1: 'Training District',
      jWs: 'Ring East',
      jW2: 'Downtown'
    }
  },
  bike: { name: 'Bike', pace: 1.8, price: 120, run: 1 / 3, sta: 0.15 },
  scooter: { name: 'Scooter', pace: 3, price: 380, fuel: 2 },
  ferry: {
    name: 'Ferry',
    pace: 10,
    fare: 5,
    first: 7,
    last: 21,
    every: 2,
    sea: [
      [540, 668],
      [640, 672],
      [730, 662],
      [795, 628],
      [870, 600],
      [930, 520],
      [985, 450],
      [1000, 385]
    ],
    piers: [
      { node: 'pier', name: 'Airport pier', i: 0 },
      { node: 'sand', name: 'Beach pier', i: 3 },
      { node: 'harbor', name: 'Harbor pier', i: 7 }
    ]
  },
  taxi: { name: 'Taxi', pace: 4, base: 8, perH: 4, region: 'wei', double: -20 }
};
/** Ground kinds no building stands on (yards and quays are built on). */
const GROUND_KEEP = ['terrace', 'paddy', 'field', 'park', 'water', 'quarry'];
/**
 * Nature on the island (owner, 2026-10-05; spec §4.19c, MapModel.nature): a hashed, jittered grid of `cell` map units; at each
 * point the biome's chance `p` keeps it and its `kinds` ([kind, weight]) pick what grows there. Shu: forest up to `treeline`
 * metres of the highlands (reliefAt), bare rock and scree above it; bamboo round its villages; tea on its terraces. Wei: a few
 * trees, park trees, a street tree every `street.every` along its main roads. Wu: scrub inland; palms, dune grass and drift
 * logs on the sand. The Academy: lawn trees. Ground kinds: `park` grows `park`; `terrace` grows tea; fields / paddies / yards /
 * quays / water grow nothing; the quarry is rock. `life`: the few animals that loop on the map (display only).
 */
const NATURE = {
  cell: 36,
  treeline: 62,
  shu: {
    p: 0.66,
    kinds: [
      ['pine', 7],
      ['broad', 1],
      ['rock', 0.8],
      ['tuft', 2.5]
    ]
  },
  scree: {
    p: 0.45,
    kinds: [
      ['rock', 3],
      ['tuft', 1]
    ]
  },
  village: {
    p: 0.6,
    kinds: [
      ['bamboo', 3],
      ['broad', 1],
      ['tuft', 1]
    ]
  },
  tea: { p: 0.55, kinds: [['tea', 1]] },
  wei: {
    p: 0.08,
    kinds: [
      ['broad', 2],
      ['blossom', 1],
      ['tuft', 2]
    ]
  },
  park: {
    p: 0.45,
    kinds: [
      ['broad', 2],
      ['blossom', 2],
      ['bush', 1],
      ['tuft', 1]
    ]
  },
  wu: {
    p: 0.35,
    kinds: [
      ['broad', 1],
      ['bush', 2],
      ['tuft', 3],
      ['rock', 0.5]
    ]
  },
  sand: {
    p: 0.2,
    kinds: [
      ['palm', 3],
      ['dune', 4],
      ['log', 0.6]
    ]
  },
  open: {
    p: 0.25,
    kinds: [
      ['broad', 2],
      ['blossom', 1],
      ['tuft', 2]
    ]
  },
  quarry: { p: 0.3, kinds: [['rock', 1]] },
  street: { every: 16, off: 7, kind: 'broad' },
  /** Border rows (spec §4.19d, T-224): spacing along each line (map units), the share left as gaps, the hedge's ring (× the lawn disc), scrap share. */
  rows: { tree: 13, reed: 6, dune: 8, hedge: 6, hedgeAt: 0.85, fence: 7, scrap: 0.25, gap: 0.12 },
  /** Animals: where (an anchor), how many, the loop radius (map units), height above the ground (m). */
  life: [
    { kind: 'bird', at: 'peak', n: 6, r: [30, 80], up: 26 },
    { kind: 'gull', at: 'wu-harbor', n: 6, r: [20, 55], up: 12 },
    { kind: 'heron', at: 'river', n: 1, r: [0, 0], up: 0 },
    { kind: 'deer', at: 'forest', n: 4, r: [6, 12], up: 0 },
    { kind: 'dog', at: 'villages', n: 3, r: [5, 10], up: 0 },
    { kind: 'cat', at: 'wei-oldtown', n: 1, r: [4, 8], up: 0 }
  ]
};
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
  acaGym: 'gym',
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
  tapes: 'campus',
  light: 'shrine',
  hermit: 'dojo',
  roof: 'stall',
  onsen: 'hotel',
  midnight: 'court',
  oldScout: 'stall',
  cargo: 'stall',
  market: 'stall',
  hq: 'hq'
};
/** One map unit in metres (the 3D map's MAP_M): FACILITY sizes are metres. */
const MAP_UNIT_M = 0.5;
/**
 * Real facilities (spec §4.40, T-351): each place's and club HQ's own building — its design (FACILITY_OF; LANDMARK keeps the
 * category the rules read: court, gym …) and its lot FACILITY[design] = { w, d, h } (m: width, depth along the door axis, height).
 * MapModel.facilities sets the lot beside the place's road node, its door toward the node; filler lots and nature keep off it.
 * The kit stands on the lot (js/map3d/facility3d.mjs draws both). `hq`: the designs by club (team index). Display data only.
 */
const FACILITY_OF = {
  weiPower: 'strength',
  weiSpeed: 'sprintlab',
  weiWit: 'filmlib',
  weiJump: 'plyotower',
  gloria: 'club',
  sand: 'sandcourts',
  dunes: 'dunesprint',
  harbor: 'harboryard',
  pier: 'pierdeck',
  trail: 'trailhead',
  steps: 'steps',
  dojo: 'dojo',
  stone: 'stonegym',
  shrine: 'pagoda',
  cage: 'cage',
  acaGym: 'acagym',
  park: 'campus',
  home: 'home',
  hotelWei: 'towerhotel',
  hotelWu: 'inn',
  hotelShu: 'lodge',
  noodles: 'noodlebar',
  hutNoodles: 'noodlehut',
  arcade: 'arcade',
  bonfire: 'bonfire',
  street: 'overcourt',
  tapes: 'taperoom',
  light: 'lighthouse',
  hermit: 'hermit',
  roof: 'rooftop',
  onsen: 'onsen',
  midnight: 'nightcourt',
  oldScout: 'scoutbar',
  cargo: 'cargoshed',
  market: 'ridemarket',
  hq: ['hqGold', 'hqIron', 'hqHarbor', 'hqFort', 'hqPeak', 'hqOutlaws', 'hqGloria', 'hqValley']
};
const FACILITY = {
  strength: { w: 24, d: 16, h: 9 },
  sprintlab: { w: 46, d: 26, h: 10 },
  filmlib: { w: 20, d: 16, h: 12 },
  plyotower: { w: 18, d: 18, h: 30 },
  club: { w: 30, d: 24, h: 9 },
  sandcourts: { w: 36, d: 22, h: 5 },
  dunesprint: { w: 30, d: 24, h: 5 },
  harboryard: { w: 34, d: 22, h: 14 },
  pierdeck: { w: 26, d: 16, h: 7 },
  trailhead: { w: 16, d: 14, h: 6 },
  steps: { w: 12, d: 30, h: 12 },
  dojo: { w: 22, d: 20, h: 10 },
  stonegym: { w: 22, d: 16, h: 8 },
  pagoda: { w: 20, d: 18, h: 17 },
  cage: { w: 22, d: 18, h: 6 },
  acagym: { w: 28, d: 18, h: 9 },
  campus: { w: 30, d: 22, h: 17 },
  home: { w: 8, d: 7, h: 6 },
  towerhotel: { w: 16, d: 14, h: 28 },
  inn: { w: 22, d: 12, h: 9 },
  lodge: { w: 18, d: 13, h: 10 },
  noodlebar: { w: 11, d: 9, h: 7 },
  noodlehut: { w: 10, d: 9, h: 6 },
  arcade: { w: 15, d: 11, h: 9 },
  bonfire: { w: 13, d: 13, h: 4 },
  overcourt: { w: 24, d: 15, h: 6 },
  taperoom: { w: 11, d: 9, h: 7 },
  lighthouse: { w: 11, d: 11, h: 24 },
  hermit: { w: 18, d: 15, h: 6 },
  rooftop: { w: 11, d: 11, h: 11 },
  onsen: { w: 24, d: 18, h: 7 },
  nightcourt: { w: 24, d: 16, h: 12 },
  scoutbar: { w: 10, d: 9, h: 7 },
  cargoshed: { w: 20, d: 14, h: 9 },
  ridemarket: { w: 22, d: 14, h: 7 },
  hqGold: { w: 18, d: 18, h: 38 },
  hqIron: { w: 20, d: 16, h: 24 },
  hqHarbor: { w: 24, d: 16, h: 14 },
  hqFort: { w: 22, d: 22, h: 13 },
  hqPeak: { w: 20, d: 20, h: 18 },
  hqOutlaws: { w: 22, d: 16, h: 9 },
  hqGloria: { w: 24, d: 18, h: 13 },
  hqValley: { w: 24, d: 15, h: 10 }
};

/**
 * Street-level interiors (spec §4.37 6; T-336b the prototype, T-362 every place): keyed by landmark id (a SPOTS id, `hq<i>`,
 * `venue:<id>`). Local metres in the facility lot's frame (centre 0, door on +z, as facility3d / kit3d). Display data: no rules here.
 *   { kind, fac, hall: { x, z, w, d, h, y?, roof? } | null, w, d, h (the hall's size; the arena: its bowl), stations }
 * hall = the building you walk into (its own shell by size; a sub-box of the lot: x / z its centre, y its floor over the lot's feet,
 * roof how far above h the landmark's roof reaches, pad how far its eaves overhang — the cut takes both); null = an outdoor
 * facility (open: its kit is the station).
 * stations [{ id, name, at, slots, piece?, out?, y?, and one action }] — at = where you walk up to (the prompt within INTERIOR_NEAR m),
 * piece = the furniture interior3d draws there (IPIECE; none outdoors: the facility's own kit stands there), out = outside the hall,
 * slots = where today's people for the place stand. Actions (what the prompt's F does, the place card's own button):
 *   order: a day order (City.orders) · sleep: Sleep 8 / 6 / 4 h · act: true | opt (the place's own Go — an outing, a secret place,
 *   the drone) + verb · buy: 'bike' | 'scooter' (the Harbor Market) · card: the place's card (a desk, a club board, a counter).
 * The first station is where you arrive (MapModel.inside). Built once at load from INTERIOR_HALL (the hall per facility design),
 * INTERIOR_OUT (outdoor kit spots, lot fractions) and the place's kit (KITS → orders) + Stretch; varied per place by a hash (the
 * layout mirrored) — no randoms.
 */
const INTERIOR_NEAR = 2.5;
/** The hall per facility design (m, lot frame; kind = its furniture and look). Designs not listed are open (outdoor). */
const INTERIOR_HALL = {
  strength: { kind: 'gym', x: 0, z: 0, w: 24, d: 16, h: 7, roof: 3.5 },
  filmlib: { kind: 'study', x: 0, z: -0.6, w: 20, d: 16, h: 11, roof: 1.5 },
  plyotower: { kind: 'gym', x: 0, z: 0, w: 18, d: 18, h: 4, roof: 0.5 },
  club: { kind: 'lounge', x: -5.4, z: -6.5, w: 18, d: 10, h: 5, roof: 3, pad: 0.9 },
  harboryard: { kind: 'shed', x: -8, z: -4.5, w: 18, d: 13, h: 6.5, roof: 3 },
  dojo: { kind: 'dojo', x: 0, z: -5, w: 15.4, d: 10, h: 3.8, y: 0.6, roof: 6, pad: 2 },
  stonegym: { kind: 'gym', x: -3.96, z: -1.6, w: 13.6, d: 11.2, h: 4, roof: 3, pad: 0.6 },
  pagoda: { kind: 'library', x: 0, z: 0, w: 10, d: 9, h: 3.4, y: 0.8, roof: 1, pad: 1.3 },
  acagym: { kind: 'gym', x: -3.36, z: -0.9, w: 19.6, d: 14.4, h: 5.5, roof: 3.5 },
  campus: { kind: 'hall', x: 0, z: -5.5, w: 24, d: 9.2, h: 7, roof: 1 },
  home: { kind: 'home', x: 0, z: 0, w: 6.4, d: 5.25, h: 3.4, roof: 2.6, pad: 0.7 },
  towerhotel: { kind: 'room', x: 0, z: -2, w: 16, d: 10, h: 4, roof: 0.5 },
  inn: { kind: 'room', x: -1.5, z: -1.3, w: 19, d: 9.4, h: 6, roof: 2.6 },
  lodge: { kind: 'room', x: 0, z: -1.5, w: 18, d: 10, h: 4, roof: 6 },
  noodlebar: { kind: 'bar', x: 0, z: -0.9, w: 11, d: 7.2, h: 5.2, roof: 0.5 },
  noodlehut: { kind: 'bar', x: 0, z: -0.5, w: 8, d: 6.3, h: 3, roof: 1.8, pad: 0.6 },
  arcade: { kind: 'arcade', x: 0, z: 0, w: 15, d: 11, h: 7, roof: 0.5, pad: 1.4 },
  taperoom: { kind: 'nook', x: 0, z: 0, w: 8.8, d: 7.2, h: 4, roof: 0.6 },
  rooftop: { kind: 'nook', x: 0, z: 0, w: 8.8, d: 8.8, h: 7, roof: 0.3 },
  onsen: { kind: 'bath', x: -6, z: -4.5, w: 12, d: 9, h: 3.6, roof: 2.4, pad: 1.3 },
  scoutbar: { kind: 'bar', x: 0, z: 0, w: 8, d: 7.2, h: 6, roof: 0.6 },
  cargoshed: { kind: 'shed', x: 2, z: 0, w: 16, d: 14, h: 5, roof: 3.7 },
  hqGold: { kind: 'hq', x: 0, z: 0, w: 18, d: 18, h: 5, roof: 0.5 },
  hqIron: { kind: 'hq', x: 0, z: 0, w: 20, d: 16, h: 8, roof: 0.5 },
  hqHarbor: { kind: 'hq', x: 0, z: 0, w: 24, d: 16, h: 8, roof: 4.2 },
  hqFort: { kind: 'hq', x: 0, z: 0, w: 18, d: 18, h: 9, roof: 1.2 },
  hqPeak: { kind: 'hq', x: 0, z: 0, w: 14, d: 14, h: 4.6, y: 1.6, roof: 9, pad: 2.6 },
  hqOutlaws: { kind: 'hq', x: 0, z: -2.4, w: 22, d: 11.2, h: 5, roof: 0.5 },
  hqGloria: { kind: 'hq', x: 0, z: -2.7, w: 19.2, d: 10.8, h: 8, roof: 3.2, pad: 0.8 },
  hqValley: { kind: 'hq', x: 0, z: -2.25, w: 21.6, d: 9, h: 4, roof: 3.4, pad: 1 }
};
/**
 * Outdoor stations per facility design (lot fractions [fx, fz] of w / d; door on +z): a kit tag, an order id, or `act` / `stretch` /
 * `bike` / `scooter` → where that station stands on the lot (its kit is drawn by facility3d). `y` = a raised deck (m).
 */
const INTERIOR_OUT = {
  sprintlab: { track: [-0.04, 0.38], mats: [0.12, 0.27], stretch: [-0.25, 0] },
  club: { water: [-0.12, 0.25], mats: [0.33, 0.22] },
  sandcourts: { sandDrill: [-0.26, 0], lifeguard: [0.26, 0.05], mats: [0, -0.3], stretch: [0, 0.32] },
  dunesprint: { dunes: [0.1, 0.33], sandDrill: [0.2, -0.1], lifeguard: [-0.3, 0.2], stretch: [-0.2, -0.15] },
  harboryard: { crates: [0.24, 0.3] },
  pierdeck: { plyo: [0, -0.1], water: [-0.17, -0.22], stretch: [0.22, 0.3], y: 1.2 },
  trailhead: { trail: [0, 0.2], stretch: [-0.25, 0.05] },
  steps: { steps: [0, 0.47], stretch: [0.36, 0.4] },
  dojo: { chores: [0.37, 0.33] },
  stonegym: { crates: [0.3, 0.3] },
  cage: { weights: [-0.12, -0.12], stretch: [0.25, 0.12] },
  campus: { act: [0, 0.28] },
  bonfire: { act: [0, 0.25], stretch: [-0.3, 0.3] },
  overcourt: { act: [0, 0.15], stretch: [0.36, 0.3] },
  lighthouse: { act: [0.25, 0.2], stretch: [-0.3, 0.3] },
  hermit: { act: [0.125, 0.125], stretch: [-0.3, 0.3] },
  nightcourt: { act: [0, 0.15], stretch: [0.36, 0.32] },
  ridemarket: { bike: [-0.33, 0.28], scooter: [0.3, 0.28], stretch: [0, -0.2] }
};
/** The furniture piece for a day order (interior3d IPIECE draws it) and the station's name. */
const INTERIOR_ORDER = {
  heavy: ['rack', 'Weight rack'],
  plyo: ['plyo', 'Plyo boxes'],
  sprints: ['lane', 'Sprint lane'],
  mobility: ['mats', 'Mats'],
  sandDrill: [null, 'Sand court'],
  lifeguard: [null, 'Lifeguard chair'],
  dunes: [null, 'Dune lane'],
  swim: ['pool', 'Pool'],
  stepRuns: [null, 'The steps'],
  trailRun: [null, 'Trailhead'],
  film: ['screen', 'Film screen'],
  books: ['shelves', 'Bookshelves'],
  allRound: ['multigym', 'Multi-gym'],
  haul: ['crates', 'Crate yard'],
  chores: ['mop', 'Mop and bucket'],
  stretch: ['stretch', 'Stretch mat']
};
/**
 * Per kind: the hall's spots (fractions of the hall, [u, v]; v = +0.5 the door wall) the kit's stations take in order, and the
 * kind's own station(s) at fixed spots (a desk, the bed, a counter, the club board …). `act` = the place's own Go with its verb.
 */
const INTERIOR_KIND = {
  gym: {
    spots: [
      [-0.28, -0.22],
      [0.05, -0.22],
      [0.3, 0.05],
      [-0.05, 0.12],
      [0.3, -0.25]
    ],
    own: [{ id: 'desk', piece: 'desk', card: true, at: [-0.34, 0.3] }]
  },
  study: {
    spots: [
      [0, -0.2],
      [0.3, 0.15],
      [-0.3, 0.1]
    ],
    own: [{ id: 'desk', piece: 'desk', card: true, at: [-0.3, 0.3] }]
  },
  lounge: { spots: [[0.25, 0.05]], own: [{ id: 'desk', piece: 'desk', card: true, at: [-0.25, -0.05] }] },
  shed: {
    spots: [
      [-0.2, -0.2],
      [0.25, 0.1]
    ],
    own: [{ id: 'thing', piece: 'drone', act: true, at: [-0.1, 0.05] }]
  },
  dojo: {
    spots: [
      [0, -0.12],
      [0.3, 0.2]
    ],
    own: [{ id: 'altar', piece: 'altar', card: true, at: [-0.3, -0.3], name: 'Shrine' }]
  },
  library: {
    spots: [
      [-0.22, -0.25],
      [0.2, -0.05],
      [-0.2, 0.25]
    ],
    own: []
  },
  hall: { spots: [[0.25, 0.15]], own: [{ id: 'board', piece: 'board', card: true, at: [-0.3, -0.35], name: 'Notice board' }] },
  home: { spots: [[0.26, -0.15]], own: [{ id: 'bed', piece: 'bed', sleep: true, at: [-0.2, 0.15], name: 'Bed' }] },
  room: { spots: [[0.3, 0.2]], own: [{ id: 'bed', piece: 'bed', sleep: true, at: [-0.25, -0.2], name: 'Bed' }] },
  bar: { spots: [[0.3, 0.25]], own: [{ id: 'counter', piece: 'counter', act: true, at: [-0.1, -0.15], name: 'Counter' }] },
  arcade: { spots: [[0.3, 0.25]], own: [{ id: 'machines', piece: 'machines', act: true, at: [-0.1, -0.2], name: 'Arcade machines' }] },
  nook: { spots: [[0.25, 0.25]], own: [{ id: 'thing', piece: 'tv', act: true, at: [-0.15, -0.2], name: 'Tape deck' }] },
  bath: { spots: [[0.3, 0.3]], own: [{ id: 'bath', piece: 'bath', act: true, at: [-0.1, -0.12], name: 'Hot bath' }] },
  hq: { spots: [], own: [{ id: 'board', piece: 'board', card: true, at: [0, -0.3], name: 'Club board' }] },
  open: { spots: [], own: [] }
};
/** Per place: the verb of its own Go (an outing, a secret place) and the name of its own thing where the kind's is not it. */
const INTERIOR_ACT = {
  park: { verb: 'Relax', name: 'The lawn' },
  noodles: { card: true, name: 'Counter' }, // (dinner: pick who comes — the card)
  hutNoodles: { card: true, name: 'Counter' },
  arcade: { verb: 'Night out' },
  bonfire: { verb: 'Night out', name: 'The fire' },
  street: { verb: 'Hustle', name: 'The court' },
  tapes: { verb: 'Watch' },
  light: { card: true, name: 'The lighthouse door' }, // (two choices: the card)
  hermit: { verb: 'Take the trial', name: 'The old court' },
  roof: { verb: 'Read the letter', name: 'The letterbox', piece: 'letters' },
  onsen: { verb: 'Soak' },
  midnight: { verb: 'Play the night game', name: 'The court' },
  oldScout: { verb: 'Ask for the number', name: 'The bar' },
  cargo: { verb: 'Buy the drone', name: 'The drone crate', piece: 'drone' }
};
const INTERIOR = (() => {
  const out = {},
    hash = s => {
      let h = 2166136261;
      for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
      return h >>> 0;
    },
    r2 = v => Math.round(v * 100) / 100;
  /** Build one place's interior: id = the landmark id, fac = its design, kit = its KITS tags, spot = a SPOTS id (null: an HQ). */
  const make = (id, fac, kit, spot) => {
    const H = INTERIOR_HALL[fac] || null,
      O = INTERIOR_OUT[fac] || {},
      S = FACILITY[fac],
      K = INTERIOR_KIND[H ? H.kind : 'open'],
      flip = hash(id) % 2 ? -1 : 1, // the layout mirrored for half the places (no two alike)
      inHall = ([u, v]) => [r2(H.x + flip * u * H.w), r2(H.z + v * H.d)],
      onLot = ([fx, fz]) => [r2(fx * S.w), r2(fz * S.d)],
      stations = [],
      spots = K.spots.slice();
    const place = (st, key, fixed) => {
      if (O[key]) return { ...st, at: onLot(O[key]), out: true, piece: undefined, ...(O.y ? { y: O.y } : {}) };
      if (H && fixed) return { ...st, at: inHall(fixed) };
      if (H && spots.length) return { ...st, at: inHall(spots.shift()) };
      return null;
    };
    // the kit's day orders first (the lead first: where you arrive), then the kind's own, then Stretch
    const orders = [];
    for (const t of kit || []) for (const o of (KITS[t] && KITS[t].orders) || []) orders.push([o, t]);
    const seen = new Set();
    for (const [o, t] of orders) {
      if (seen.has(o)) continue;
      seen.add(o);
      const [piece, name] = INTERIOR_ORDER[o] || [null, DAY_ORDERS[o].name],
        st = place({ id: o, name, order: o, piece }, O[o] ? o : t);
      if (st) stations.push(st);
    }
    const A = (spot && INTERIOR_ACT[spot]) || {};
    for (const q of K.own) {
      if (q.act && !(spot && SPOTS[spot].act)) continue; // (a shed of a kit place: no Go of its own)
      const st = { id: q.id, name: q.name || 'Front desk', piece: q.piece };
      if (q.card) st.card = true;
      if (q.sleep) st.sleep = true;
      if (q.act) Object.assign(st, A.card ? { card: true } : { act: true, verb: A.verb || 'Go' });
      if (A.name && q.act) st.name = A.name;
      if (A.piece && q.act) st.piece = A.piece;
      stations.push(place(st, '-', q.at));
    }
    if (O.act && spot)
      stations.unshift({
        id: 'act',
        name: A.name || 'Here',
        ...(A.card ? { card: true } : { act: true, verb: A.verb || 'Go' }),
        at: onLot(O.act),
        out: true,
        ...(O.y ? { y: O.y } : {})
      });
    for (const k of ['bike', 'scooter'])
      if (O[k]) stations.push({ id: k, name: k === 'bike' ? 'Bikes' : 'Scooters', buy: k, at: onLot(O[k]), out: true });
    if (spot) {
      const st = place({ id: 'stretch', name: 'Stretch mat', order: 'stretch', piece: 'stretch' }, 'stretch');
      if (st) stations.push(st);
    }
    // where today's people stand: beside each station (two for an order, none at a card / bed / buy), inside the hall
    for (const st of stations) {
      const n = st.order && st.order !== 'stretch' ? 2 : st.order || st.act ? 1 : 0,
        lim = (v, a, b) => Math.max(a, Math.min(b, v));
      st.slots = Array.from({ length: n }, (_, i) => {
        let x = st.at[0] + (n === 1 ? 1.1 : i ? 1.1 : -1.1),
          z = st.at[1] - 0.9;
        if (H && !st.out) ((x = lim(x, H.x - H.w / 2 + 0.6, H.x + H.w / 2 - 0.6)), (z = lim(z, H.z - H.d / 2 + 0.6, H.z + H.d / 2 - 0.6)));
        return [r2(x), r2(z)];
      });
    }
    return { kind: H ? H.kind : 'open', fac, hall: H, w: H ? H.w : S.w, d: H ? H.d : S.d, h: H ? H.h : 0, stations };
  };
  for (const id of Object.keys(SPOTS)) if (FACILITY[FACILITY_OF[id]]) out[id] = make(id, FACILITY_OF[id], SPOTS[id].kit, id);
  FACILITY_OF.hq.forEach((fac, i) => (out[`hq${i}`] = make(`hq${i}`, fac, null, null)));
  // the prototype's gym keeps its hand layout (T-336b, judged good): bench + rack → Heavy sets, mats → Mobility, mirror → Stretch, desk → card
  out.weiPower.stations = [
    { id: 'bench', name: 'Bench press', order: 'heavy', piece: 'bench', at: [-1.6, -0.6], slots: [[-2.6, -0.2]] },
    {
      id: 'rack',
      name: 'Weight rack',
      order: 'heavy',
      piece: 'rack',
      at: [-4.2, -2.4],
      slots: [
        [-5, -3.2],
        [-3.4, -3.2]
      ]
    },
    {
      id: 'mats',
      name: 'Mats',
      order: 'mobility',
      piece: 'mats',
      at: [2.4, -1],
      slots: [
        [1.6, -1.6],
        [3.2, -1.6],
        [2.4, -0.2]
      ]
    },
    { id: 'mirror', name: 'Mirror wall', order: 'stretch', piece: 'mirror', at: [4.6, 2.2], slots: [[5.6, 1.6]] },
    { id: 'desk', name: 'Front desk', card: true, piece: 'desk', at: [-4.2, 2.6], slots: [] }
  ];
  out.weiPower.decor = 'strength'; // its sprint lane, dumbbell rack and plate tree
  // the venues: the arena's open bowl (its centre court → the card; a venue has no day orders); the Academy Hall's old real court
  out['venue:arena'] = {
    kind: 'arena',
    hall: null,
    w: 22,
    d: 15,
    h: 0,
    stations: [{ id: 'court', name: 'Centre court', card: true, at: [0, 0], slots: [] }]
  };
  out['venue:hall'] = {
    kind: 'court',
    hall: { kind: 'court', x: 0, z: 0, w: 18, d: 10, h: 4.4, roof: 4 },
    w: 18,
    d: 10,
    h: 4.4,
    stations: [{ id: 'court', name: 'The old court', card: true, piece: 'court', at: [0, 1.6], slots: [] }]
  };
  return out;
})();

/** The spread's lot grid (scaleMap): a district's lot spacing × this (towns spread × K, so ~(K / LOT_SPREAD)² × the lots). */
const LOT_SPREAD = 1.6;
/**
 * Scale the island once (MAP_SCALE): every map point (coast, regions, places, roads, HQs, venues, homes, labels, mountains,
 * wealth core, region anchors) × MAP_SCALE. Towns keep their size and building count: circle districts move but keep their
 * radius, point districts move by their centroid, the area-wide ones (the beach ring, the Wei ring) thin by MAP_SCALE²; minors
 * and the Academy park keep their size, and what stands in them moves with them. Distances that measure the map (travel, reveal, hex size, Wei's wealth fall-off) scale too.
 */
(function scaleMap(S, K) {
  if (S === 1 && K === 1) return;
  // small areas keep their size: a point inside the Academy park or a minor's patch moves with that area's centre
  const areas = [CITY.park, ...Object.values(CITY.minors)].map(e => ({ ...e, rx: e.rx || e.r, ry: e.ry || e.r, rot: e.rot || 0 })),
    within = ([x, y]) =>
      areas.find(e => {
        const a = (-e.rot * Math.PI) / 180,
          dx = x - e.x,
          dy = y - e.y,
          u = dx * Math.cos(a) - dy * Math.sin(a),
          v = dx * Math.sin(a) + dy * Math.cos(a);
        return (u / e.rx) ** 2 + (v / e.ry) ** 2 <= 1;
      }),
    seen = new Set(),
    pt = p => {
      if (!p || seen.has(p)) return;
      seen.add(p);
      const e = within(p);
      if (e) {
        p[0] += e.x * (S - 1);
        p[1] += e.y * (S - 1);
      } else {
        p[0] *= S;
        p[1] *= S;
      }
    },
    pts = a => a.forEach(pt);
  for (const k of ['coast', 'inner', 'dunes', 'wei', 'wu', 'shu', 'beach', 'weiWu', 'strip', 'hq']) pts(CITY[k]);
  pt(CITY.relief.peak.at);
  pts(CITY.relief.spine.line);
  pts(CITY.relief.river.line);
  for (const k of ['peak', 'spine', 'river']) for (const f of ['r', 'w']) if (CITY.relief[k][f]) CITY.relief[k][f] *= S;
  Object.values(CITY.label).forEach(pt);
  pt(CITY.airport);
  pt(CITY.ritual);
  for (const e of [CITY.park, ...Object.values(CITY.minors)]) {
    e.x *= S;
    e.y *= S;
  }
  CITY.w *= S;
  CITY.h *= S;
  for (const s of Object.values(SPOTS)) pt(s.at);
  Object.values(HOME_AT).forEach(pt);
  for (const v of Object.values(VENUES)) pt(v.at);
  Object.values(ROADS.nodes).forEach(pt);
  for (const d of DISTRICTS) {
    const q = d.poly;
    if (Array.isArray(q)) {
      const c = q.reduce((a, p) => [a[0] + p[0] / q.length, a[1] + p[1] / q.length], [0, 0]);
      for (const p of q) {
        p[0] += c[0] * (S - 1);
        p[1] += c[1] * (S - 1);
      }
    } else if (q && typeof q === 'object') {
      q.x *= S;
      q.y *= S;
    } else d.density /= S * S; // 'beach', 'wei': the area grew
  }
  TRANSPORT.ferry.sea.forEach(pt);
  for (const q of [...GROUND.map(g => g.poly), ...TRAFFIC.boats]) {
    q.x *= S;
    q.y *= S;
  }
  pt(WEALTH.weiCore);
  WEALTH.weiEdge *= S;
  for (const r of Object.values(REGIONS)) pt(r.at);
  HEX.size *= S;
  if (K === 1) return;
  // the spread (spec §4.40): the whole S-scaled island × K — places, roads, towns, districts, minors, the park, ground use and
  // their sizes alike (the same layout, K × the room); a district's lot grid spreads by LOT_SPREAD (more lots, thinner); heights stay
  const seen2 = new Set(),
    pk = p => {
      if (!p || seen2.has(p)) return;
      seen2.add(p);
      p[0] *= K;
      p[1] *= K;
    },
    pks = a => a.forEach(pk);
  for (const k of ['coast', 'inner', 'dunes', 'wei', 'wu', 'shu', 'beach', 'weiWu', 'strip', 'hq']) pks(CITY[k]);
  pk(CITY.relief.peak.at);
  pks(CITY.relief.spine.line);
  pks(CITY.relief.river.line);
  for (const k of ['peak', 'spine', 'river']) for (const f of ['r', 'w']) if (CITY.relief[k][f]) CITY.relief[k][f] *= K;
  Object.values(CITY.label).forEach(pk);
  pk(CITY.airport);
  pk(CITY.ritual);
  for (const e of [CITY.park, ...Object.values(CITY.minors)]) for (const f of ['x', 'y', 'r', 'rx', 'ry']) if (e[f]) e[f] *= K;
  CITY.w *= K;
  CITY.h *= K;
  for (const s of Object.values(SPOTS)) pk(s.at);
  Object.values(HOME_AT).forEach(pk);
  for (const v of Object.values(VENUES)) pk(v.at);
  Object.values(ROADS.nodes).forEach(pk);
  const G = LOT_SPREAD;
  for (const d of DISTRICTS) {
    const q = d.poly;
    d.gap *= G;
    if (Array.isArray(q)) pks(q);
    else if (q && typeof q === 'object') for (const f of ['x', 'y', 'r']) q[f] *= K;
    // 'beach', 'wei' (area-wide): the spread grid alone grows them like the others
  }
  for (const q of GROUND.map(g => g.poly)) for (const f of ['x', 'y', 'r', 'r0']) if (q[f]) q[f] *= K;
  for (const q of TRAFFIC.boats) for (const f of ['x', 'y', 'r']) q[f] *= K;
  pks(TRANSPORT.ferry.sea);
  pk(WEALTH.weiCore);
  WEALTH.weiEdge *= K;
  for (const r of Object.values(REGIONS)) pk(r.at);
  HEX.size *= K;
})(MAP_BASE, MAP_SCALE / MAP_BASE);
/** Distance from p to the polyline `line`, and how far along it (0–1) the nearest point is. */
function lineDist(p, line) {
  let best = Infinity,
    at = 0,
    run = 0;
  const L = line.reduce((n, q, i) => (i ? n + Math.hypot(q[0] - line[i - 1][0], q[1] - line[i - 1][1]) : 0), 0);
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1],
      b = line[i],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      len = Math.hypot(dx, dy) || 1,
      t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (len * len))),
      d = Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
    if (d < best) ((best = d), (at = (run + t * len) / L));
    run += len;
  }
  return { d: best, at };
}
/**
 * The highlands' designed height at map point p (metres, ≥ 0; spec §4.19b): the Peak and the Spine (the higher of the two),
 * minus the river's valley. Pure, no noise: the 3D terrain adds its own roughness; City.ground prices the climb.
 */
function reliefAt(p) {
  const R = CITY.relief,
    dp = Math.hypot(p[0] - R.peak.at[0], p[1] - R.peak.at[1]) / R.peak.r,
    peak = dp < 1 ? R.peak.h * (1 - dp * dp) ** 2 : 0,
    s = lineDist(p, R.spine.line),
    spine = (R.spine.h[0] + (R.spine.h[1] - R.spine.h[0]) * s.at) * Math.exp(-((s.d / R.spine.w) ** 2)),
    r = lineDist(p, R.river.line);
  return Math.max(0, Math.max(peak, spine) - R.river.d * Math.exp(-((r.d / R.river.w) ** 2)) * (r.d < R.river.w * 3 ? 1 : 0));
}
/**
 * Biome ground (spec §4.19d, T-224): neutral nature tones per region — never the faction colour (the hex fill carries that).
 * a / b = two tones mixed by a soft noise (Wei: paving grey / trimmed lawn in patches, `patch` m across); Shu climbs from
 * moss to rock grey between `rock[0]` and `rock[1]` m of height. Between two biomes the ground cross-fades over `fade` m
 * (minors over `fadeMinor`); the Academy's lawn is a disc of `academyR` hex sizes round the park.
 * Strips: `gravel` along the Shu–Wei line (`gravelW` m wide), `bank` (sand / pebble) beside the river (`bankW` × its width).
 */
const BIOME = {
  fade: 50,
  fadeMinor: 18,
  academyR: 2.3,
  shu: { a: '#4f7d3c', b: '#5a8645', rock: [10, 48], rockC: '#807b70', patch: 30 },
  wei: { a: '#8b8c84', b: '#6f9650', patch: 16 },
  wu: { a: '#aaa56a', b: '#bcb078', patch: 26 },
  open: { a: '#68b046', b: '#73ba4f', patch: 22 },
  outlaws: { a: '#86775e', b: '#6f6a5c', patch: 8 },
  gloria: { a: '#6aa253', b: '#7aae5c', patch: 12 },
  gravel: '#a39a86',
  gravelW: 4,
  bank: '#c2b58f',
  bankW: 0.3
};
/**
 * Region border kinds (spec §4.19d): the ground strip (BIOME) and the row of nature objects along each line. The rows are
 * drawn by the nature layer (T-223, js/map3d/nature3d.mjs) — not built yet: the model carries the lines (`land.borders`).
 */
const BORDERS = {
  shuWei: { strip: 'gravel', row: 'treeline' },
  river: { strip: 'bank', row: 'reeds' },
  dunes: { row: 'dunegrass' },
  academy: { row: 'hedge' },
  outlaws: { row: 'fence' }
};
