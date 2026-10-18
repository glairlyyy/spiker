// Career mode constants: the start, trainings, mood levels, calendar, rewards, ranks.

const CAREER = {
  weeks: 28, // the season; the U21 Final Cup follows week 28 (CUPS)
  star: { ovr: 80 }, // your player becomes a ★ star at this overall
  op: { ovr: 88, key: 95, wit: 1.5 }, // …and an OP red star at this overall + key stat + wit
  start: 1, // every stat of a new player (Power / Defense / Speed / Jump); wit starts at witBase (spec §4.22)
  statMin: 1, // the lowest any of your stats can go (events, injuries)
  witBase: 1.0,
  runCap: 99,
  witRunCap: 2.0,
  staMax: 100,
  floorChance: 0.7, // chance each teammate shows up at some training this week
  spPerTraining: 10,
  /**
   * The island's players at the start of a run (owner, 2026-10-05: an easier first weeks): every generated player's rolled
   * OVR (`from`, ~55–78) is mapped linearly onto `to` (40–50) — the same order, the same stat shape, all stats shifted together.
   * The named players (rival, cohort, aces) keep their own curves.
   */
  npcStart: { from: [55, 78], to: [40, 50] }
};
/** Five mood levels, Awful → Great: training multiplier and the match-day form (mood face). */
const MOODS = [
  { name: 'Awful', mul: 0.8, form: -0.7 },
  { name: 'Bad', mul: 0.9, form: -0.35 },
  { name: 'Normal', mul: 1.0, form: 0 },
  { name: 'Good', mul: 1.1, form: 0.35 },
  { name: 'Great', mul: 1.2, form: 0.7 }
];
/** Match history (T-052): entries kept on `run.mlog` (the oldest are dropped). */
const MLOG = { max: 80 };
/**
 * Your body (spec §4.33): Strength, Agility, Endurance, Flexibility (+ Wit) are what you train; the court skills the match reads
 * (power / def / speed / jump) are worked out from them (Body.court). `swing` / `depth`: Flexibility a full swing / a deep load
 * needs, × Strength (`swingMin` / `depthMin`: the floors). `w`: each court skill's weights. `of`: the body stat an old court-stat
 * change lands on (events, injuries); `court`: the court skill a body stat's training stands for (teammates training beside you).
 * `sta`: Endurance lifts your career stamina, staMax = CAREER.staMax + end × sta.
 */
const BODY = {
  keys: ['str', 'agi', 'end', 'flex'],
  name: { str: 'Strength', agi: 'Agility', end: 'Endurance', flex: 'Flexibility' },
  short: { str: 'Str', agi: 'Agi', end: 'End', flex: 'Flex' },
  glyph: { str: '▲', agi: '≫', end: '◆', flex: '∿' },
  desc: {
    str: 'Strength. Swing speed and the jump’s push — wasted without the Flexibility to swing it.',
    agi: 'Agility. First step, reaching the ball, the jump’s spring.',
    end: 'Endurance. Lasting: speed late on, more career stamina.',
    flex: 'Flexibility. Getting low, a full swing, a deep load.'
  },
  swing: 1,
  swingMin: 0.5,
  depth: 0.95,
  depthMin: 0.6,
  w: {
    power: { str: 0.85, agi: 0.15, base: 0.55, k: 0.45 }, // Power = 0.85 · str · (0.55 + 0.45 · swing) + 0.15 · agi
    jump: { str: 0.55, agi: 0.45 }, // Jump = 0.55 · str · depth + 0.45 · agi
    speed: { agi: 0.75, end: 0.25 },
    def: { flex: 0.45, agi: 0.35, end: 0.2 }
  },
  of: { power: 'str', jump: 'agi', speed: 'end', def: 'flex' },
  court: { str: 'power', agi: 'jump', end: 'speed', flex: 'def' },
  sta: 0.5
};
/** Trainings: main/side gains (body stats, spec §4.33) and stamina cost. Wit gains are in wit units. */
const TRAININGS = {
  power: { name: 'Power', main: ['str', 7], side: ['flex', 2], sta: 20 },
  def: { name: 'Defense', main: ['flex', 7], side: ['agi', 2], sta: 20 },
  speed: { name: 'Speed', main: ['end', 7], side: ['agi', 2], sta: 20 },
  jump: { name: 'Jump', main: ['agi', 7], side: ['str', 2], sta: 20 },
  wit: { name: 'Wit', main: ['wit', 0.06], side: ['flex', 2], sta: 5 },
  // the Academy Gym (spec §4.18e): a little of every stat at a fixed Lv 1 (lv); `more` = the gains past main / side
  all: {
    name: 'All-round',
    main: ['str', 2],
    side: ['flex', 2],
    more: [
      ['agi', 2],
      ['end', 2],
      ['wit', 0.025]
    ],
    sta: 15,
    lv: 1
  }
};
/**
 * Day orders (spec §4.33; DAY_ORDERS — `ORDERS` is the match engine's role orders): what you can do on a day at a place, brought by its kit (KITS) — Stretch anywhere. main / side / more:
 * body gains like TRAININGS (wit in wit units); sta: stamina; price: × TRAIN_FEE × the region's price (0 = free); pay: money a
 * Work order earns; train: the training it stands for (sponsor perks, the floor); kind: 'drill' (fast, costs) | 'work' (pays,
 * slower) | 'stretch' (free, never fails). The day track names the order.
 */
const DAY_ORDERS = {
  heavy: { name: 'Heavy sets', kind: 'drill', main: ['str', 7], side: ['agi', 2], sta: 20, price: 1.5, train: 'power' },
  plyo: { name: 'Box jumps', kind: 'drill', main: ['agi', 7], side: ['str', 2], sta: 20, price: 1.5, train: 'jump' },
  sprints: { name: 'Sprint intervals', kind: 'drill', main: ['end', 6], side: ['agi', 3], sta: 20, price: 1.5, train: 'speed' },
  mobility: { name: 'Mobility class', kind: 'drill', main: ['flex', 7], side: ['agi', 2], sta: 12, price: 1.5, train: 'def' },
  sandDrill: { name: 'Sand drills', kind: 'drill', main: ['agi', 5], side: ['end', 3], more: [['str', 1]], sta: 20, price: 1.5, train: 'def' },
  dunes: { name: 'Dune runs', kind: 'drill', main: ['end', 5], side: ['agi', 4], sta: 22, price: 1, train: 'speed' },
  swim: { name: 'Laps', kind: 'drill', main: ['end', 5], side: ['agi', 2], more: [['flex', 2]], sta: 15, price: 1.5, train: 'speed' },
  stepRuns: { name: 'Step runs', kind: 'drill', main: ['str', 5], side: ['agi', 4], sta: 22, price: 1, train: 'jump' },
  trailRun: { name: 'Trail run', kind: 'drill', main: ['end', 6], side: ['str', 3], sta: 22, price: 1, train: 'speed' },
  film: { name: 'Film study', kind: 'drill', main: ['wit', 0.06], side: ['flex', 1], sta: 5, price: 1.5, train: 'wit' },
  books: { name: 'The old books', kind: 'drill', main: ['wit', 0.06], side: ['flex', 1], sta: 5, price: 1, train: 'wit' },
  allRound: {
    name: 'All-round',
    kind: 'drill',
    main: ['str', 2],
    side: ['flex', 2],
    more: [
      ['agi', 2],
      ['end', 2],
      ['wit', 0.025]
    ],
    sta: 15,
    price: 1,
    train: 'all'
  },
  haul: { name: 'Haul crates', kind: 'work', main: ['str', 4], side: ['end', 2], sta: 25, pay: 35, train: 'power' },
  lifeguard: { name: 'Lifeguard shift', kind: 'work', main: ['end', 3], side: ['agi', 2], sta: 18, pay: 30, train: 'def' },
  chores: { name: 'Floor duty', kind: 'work', main: ['end', 2], side: ['flex', 2], sta: 15, pay: 20, train: 'def' },
  stretch: { name: 'Stretch', kind: 'stretch', main: ['flex', 4], side: ['agi', 1], sta: 5, train: 'def' },
  // a run (T-309): its gains come from the route's ground (RUN_GROUND); this entry carries the name, the multipliers' key and the sponsor perk
  run: { name: 'Run', kind: 'run', main: ['end', 0], side: ['agi', 0], sta: 0, train: 'speed' }
};
/**
 * Running a trip (spec §4.33, T-309): the ground trains you. Per TRIP_DAY of travel cost on each kind of ground (ROADS edge kinds;
 * `steps` = the Thousand Steps' paths, `ground` = cross-country legs): body gains in DAY_ORDERS units; `sta`: stamina per trip day.
 */
const RUN_GROUND = {
  main: { end: 5 },
  street: { end: 5 },
  overpass: { end: 5 },
  boardwalk: { agi: 4, end: 1 },
  dirt: { end: 4, str: 2 },
  path: { end: 3, str: 3 },
  steps: { str: 4, agi: 4 },
  ground: { end: 4 },
  sta: 14
};
/** A place's kit (SPOTS[id].kit, equipment and ground): each tag brings its orders; `train` = the lead training of a place it leads. */
const KITS = {
  weights: { name: 'Weights', train: 'power', orders: ['heavy'] },
  crates: { name: 'Crates', train: 'power', orders: ['haul'] },
  plyo: { name: 'Plyo boxes', train: 'jump', orders: ['plyo'] },
  steps: { name: 'Steps', train: 'jump', orders: ['stepRuns'] },
  track: { name: 'Track', train: 'speed', orders: ['sprints'] },
  dunes: { name: 'Dunes', train: 'speed', orders: ['dunes'] },
  trail: { name: 'Trail', train: 'speed', orders: ['trailRun'] },
  water: { name: 'Water', train: 'speed', orders: ['swim'] },
  sand: { name: 'Sand', train: 'def', orders: ['sandDrill', 'lifeguard'] },
  mats: { name: 'Mats', train: 'def', orders: ['mobility'] },
  chores: { name: 'Floors', train: 'def', orders: ['chores'] },
  film: { name: 'Film', train: 'wit', orders: ['film'] },
  books: { name: 'Books', train: 'wit', orders: ['books'] },
  gym: { name: 'Basic gym', train: 'all', orders: ['allRound'] }
};
/** The trainings that level up with use and that teammates drill at (the fixed-level Academy Gym is not one). */
const TRAINK = Object.keys(TRAININGS).filter(k => !TRAININGS[k].lv);
const ROLE_NAME = { S: 'Setter', MB: 'Middle blocker', WS: 'Wing spiker' };
const STATNAME = { power: 'Power', def: 'Defense', speed: 'Speed', jump: 'Jump', wit: 'Wit', lead: 'Leadership' };
/** What each week is. Anything not listed is a training week. */
/** Story mode is two seasons (spec §4.28): `years` of CAREER.weeks + the U21 Cup each; `shift` = one season in weeks (the Cup week
 * counts), the offset Season.rollover takes off every stored week stamp so cooldowns and memories keep counting across it. */
const SEASON = { years: 2, shift: 29, rematch: 14, cap: 90 }; // rematch: year 2's guaranteed match against the rival's club (an 'eval' week, Eval kind 'rematch'); cap: year 2's training cap (Training.cap)
/**
 * Drive & Pain (spec §4.30): two hidden bars on you, 0–max. Drive fills on what goes right; at max → Fired up (`fired.matches`
 * of your next matches: a whole-match buff of `fired.lv`, training × `fired.train`). Pain fills on what guts you (never an injury
 * or a bad night); at max → a Scar (pools: T-291). Mood streaks feed them (`streak`). Cues: a diary line as a bar passes each `cue`.
 */
const FEEL = {
  max: 100,
  drive: { train: 2, win: 8, grade: 6, joined: 12, great: 15, rematch: 20, idle: -4 },
  pain: { loss: 12, rout: 8, bench: 6, refused: 6, rival: 25, awful: 10, scene: { rivalMeet: 12, y1Lost: 20, rematchLost: 10 } },
  streak: { great: 3, awful: 2 },
  fired: { matches: 2, lv: 2, train: 1.25 },
  cue: [50, 80]
};
/** Between the years (Season.offseason): rounds of the transfer market, then a summer of NPC growth (weeks of Growth.week). */
const OFFSEASON = { transfers: 6, summer: 4 };
const CALENDAR = { 4: 'eval', 8: 'eval', 12: 'eval', 16: 'eval', 20: 'eval', 24: 'eval', 26: 'camp', 27: 'camp', 28: 'camp' };
/** Monthly evaluations: a player who is not selected watches from the bench — wit XP worth `benchDays` day-sessions of Wit training. */
const EVAL = { benchDays: 1 };
/**
 * Your coach picks the 4 starters (Run.lineup): best same-role player by ovr + 6 × form (+ your standing with the squad's
 * faction ÷ standingPer for you). Rewards × partMul when you started or finished a match on the bench.
 */
const BENCH = { partMul: 0.6, standingPer: 20 };
/** The season's one cup, played after week `after`: squads drawn from every faction pool; the champion goes to the national team. */
const CUPS = [{ id: 'u21', after: 28, name: 'U21 Final Cup', short: 'U21', mul: 1.5, seeded: true }];
/** Placement rewards when a cup ends for you (× the cup's mul). */
const PLACES = {
  'Round of 16': { fans: 150, sp: 10 },
  Quarterfinal: { fans: 300, sp: 20 },
  Semifinal: { fans: 800, sp: 40 },
  Final: { fans: 1500, sp: 60 },
  Champion: { fans: 3000, sp: 90 }
};
/** Training and events raise a stat to here at most in year 1 (year 2: SEASON.cap — Training.cap); only match experience goes higher (up to CAREER.runCap). Spec §4.14. */
const TRAIN_CAP = 75;
/** Training depth: facility levels (uses needed per level), Hard option, streaks. */
const TRAIN_X = {
  lvUses: [0, 4, 8, 18, 26], // Lv 1–5
  hard: { gain: 1.6, sta: 2, fail: 0.15 },
  streak: { step: 0.05, max: 0.2 },
  injuryAt: 25, // stamina below this: a failed session may injure you
  physio: 30, // skill points to heal an injury at once
  /**
   * Training gives experience; a stat goes up a point each time its XP reaches `need` — which grows exponentially
   * with the stat: base × grow^(value − from). XP from a session = the training's base gain × per × every multiplier
   * (place quality, facility level, mood, streak, teammates, camp, Hard…). Wit counts in 0.02 steps (level = wit × 50).
   * Past `steep[0]` (year 1's cap) each point costs steep[1] × the last (spec §4.32): year 2's cap is a ceiling only good weeks reach.
   */
  xp: { per: 10, base: 10, grow: 1.05, from: 50, steep: [75, 1.12] }
};
/** Match grade from your own line (kills, blocks, aces, digs, errors, win): multiplies that match's rewards. */
const GRADES = [
  ['S', 7, 1.5],
  ['A', 4.5, 1.2],
  ['B', 2.5, 1],
  ['C', -99, 0.8]
];
/** Pre-match focus goals by role: [id, label, stat, target, reward]. 'err' is "at most". */
const FOCUS = {
  WS: [
    ['k', '4+ kills', 'k', 4],
    ['ace', '2+ aces', 'ace', 2],
    ['clean', 'At most 1 error', 'err', 1]
  ],
  MB: [
    ['blk', '2+ blocks', 'blk', 2],
    ['k', '3+ kills', 'k', 3],
    ['clean', 'At most 1 error', 'err', 1]
  ],
  S: [
    ['ast', '6+ assists', 'ast', 6],
    ['dig', '3+ digs', 'dig', 3],
    ['clean', 'At most 1 error', 'err', 1]
  ]
};
const FOCUS_REWARD = { sp: 25, fans: 250 };
/** Captain's team talk before a Cup match. */
const TALKS = {
  fire: { name: 'Fire them up', desc: 'Every teammate starts fired up (+0.35 mood).' },
  feed: { name: 'Feed me', desc: 'You get a Lv2 captain buff for the first 8 points.' },
  calm: { name: 'Stay composed', desc: 'Nobody on your side starts nervous; the other team starts a little tense.' }
};
/** Sponsors offered at fan milestones: a perk you keep while you meet the condition. */
const SPONSOR_AT = [2000, 5000, 8000];
const SPONSORS = {
  aqua: { name: 'Aqua Rush', perk: '+15 max stamina', cond: 'Keep your mood Normal or better for 4 weeks', kind: 'mood', weeks: 4 },
  shoes: { name: 'Skyline Shoes', perk: 'Speed and Jump training +10%', cond: 'Win your next match', kind: 'win' },
  iron: {
    name: 'IronWorks Gym',
    perk: 'Power and Defense training +10%',
    cond: 'Train (not rest) in 3 of the next 4 weeks',
    kind: 'train',
    weeks: 4
  },
  spike: { name: 'Spike TV', perk: '+20% fans from matches', cond: 'Grade A or better in your next match', kind: 'grade' }
};
/**
 * Modes chosen at creation. `game` modes are the run's kind (spec §4.26: Story guarantees you the U21 Final Cup; Endless is
 * kept for later, not playable yet); the rest are optional handicaps.
 */
const MODES = {
  story: {
    name: 'Story',
    desc: 'The U21 Final Cup always includes you and you start every match. Win it and you are called up.',
    game: true
  },
  endless: { name: 'Endless', desc: 'No guarantees. Later.', game: true, disabled: true },
  hard: { name: 'Hard league', desc: 'Every other player starts stronger and grows faster.' },
  short: { name: 'Short season', desc: 'Start at week 5 — four fewer training weeks.' }
};
/** League growth: every other player grinds each week; some break through to star, and stars to OP. */
const GROWTH = {
  weekly: [2, 4], // stat points per week (× potential), spread over stats, key stat weighted double
  pot: [0.6, 1.6], // hidden potential rolled per player
  star: 0.008, // weekly chance to awaken as a star (× potential × bond factor)
  op: 0.012, // weekly chance for a star to become OP
  bondDiv: 40, // teammates: chances × (1 + bond / bondDiv)
  share: 0.4 // teammates training with you gain this share of your main gain (and half of the side gain)
};
const REWARDS = {
  evalWin: { sp: 40, fans: 500 },
  evalLoss: { sp: 20, fans: 100 },
  cupWin: { sp: 60, fans: 1500 },
  perPlay: { sp: 2, fans: 20 } // each of your kills, blocks and aces
};
/**
 * Match experience (spec §4.14): stat XP per unit of your own stat line — kills, aces, blocks, digs, assists and attempts —
 * (wit counts in 0.02 steps like training). The XP is scaled by the opponent: factor = clamp(1 + (opponent ovr − your side's
 * ovr) × perGap, gap[0], gap[1]).
 */
/**
 * Court matches at the official venues (spec §4.21a, T-229): a tier's entry `fee`, the opponents' OVR = the week's league mean + `off`,
 * the chance an ace (a named player) takes a seat, the fans a win brings. A win pays `prize` × the fee; a loss costs only the fee.
 * `sta` per match; injury risk = the street risk × `injury`; opponents are drawn from the `pool` league players nearest the target.
 */
const COURT = {
  tiers: [
    { id: 'open', name: 'Open', fee: 20, off: -5, ace: 0.03, fans: 20 },
    { id: 'pro', name: 'Pro', fee: 80, off: 0, ace: 0.06, fans: 40 },
    { id: 'elite', name: 'Elite', fee: 200, off: 5, ace: 0.15, fans: 80 }
  ],
  prize: 2.5,
  sta: 10,
  injury: 0.5,
  pool: 12
};
const MATCH_XP = {
  // body stats (spec §4.33): kills → str, digs → flex + agi, blocks → str + agi
  per: { k: { str: 12 }, ace: { str: 8 }, blk: { str: 8, agi: 8 }, dig: { flex: 6, agi: 6 }, ast: { wit: 2 }, att: { end: 1 } },
  gap: [0.3, 2],
  perGap: 0.1
};
/**
 * Techniques are learned in play, never bought (spec §4.14). After a match you played, each technique of your role you don't
 * own is a candidate: "by doing" when your line reached `do[category] = [stat(s), count]` (a "+" adds stats), else "by facing"
 * when an opponent who played has it. Chance = doP / faceP × (0.5 + wit / 2) × the MATCH_XP gap factor, clamped to [0, 0.5].
 */
const LEARN = { do: { Attack: ['k', 3], Setter: ['ast', 6], Serve: ['ace', 1], Defense: ['blk+dig', 4] }, doP: 0.08, faceP: 0.05 };
/** Run rank by fans at the end (a two-season Story run needs twice these: rankOf). */
const RANKS = [
  ['S', 10000],
  ['A', 7000],
  ['B', 4000],
  ['C', 0]
];
