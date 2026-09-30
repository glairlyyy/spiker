// Career mode constants: creation budget, trainings, mood levels, calendar, rewards, ranks.

const CAREER = {
  weeks: 28, // two blocks: weeks 1–24 → Skyline Cup, weeks 25–28 → Grand Cup
  star: { ovr: 80 }, // your player becomes a ★ star at this overall
  op: { ovr: 88, key: 95, wit: 1.5 }, // …and an OP red star at this overall + key stat + wit
  statBase: 40,
  budget: 60,
  createCap: 70,
  witBase: 1.0,
  witStep: 0.1,
  witStepCost: 5,
  witCreateCap: 1.4,
  runCap: 99,
  witRunCap: 2.0,
  staMax: 100,
  eventChance: 0.3,
  floorChance: 0.7, // chance each teammate shows up at some training this week
  spPerTraining: 10
};
/** Five mood levels, Awful → Great: training multiplier and the match-day form (mood face). */
const MOODS = [
  { name: 'Awful', mul: 0.8, form: -0.7 },
  { name: 'Bad', mul: 0.9, form: -0.35 },
  { name: 'Normal', mul: 1.0, form: 0 },
  { name: 'Good', mul: 1.1, form: 0.35 },
  { name: 'Great', mul: 1.2, form: 0.7 }
];
/** Trainings: main/side gains and stamina cost. Wit gains are in wit units. */
const TRAININGS = {
  power: { name: 'Power', main: ['power', 7], side: ['jump', 2], sta: 20 },
  def: { name: 'Defense', main: ['def', 7], side: ['speed', 2], sta: 20 },
  speed: { name: 'Speed', main: ['speed', 7], side: ['power', 2], sta: 20 },
  jump: { name: 'Jump', main: ['jump', 7], side: ['def', 2], sta: 20 },
  wit: { name: 'Wit', main: ['wit', 0.06], side: ['def', 2], sta: 5 }
};
const TRAINK = Object.keys(TRAININGS);
const STATNAME = { power: 'Power', def: 'Defense', speed: 'Speed', jump: 'Jump', wit: 'Wit', lead: 'Leadership' };
/** What each week is. Anything not listed is a training week. */
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
/** Training depth: facility levels (uses needed per level), Hard option, streaks, limit-break gates. */
const TRAIN_X = {
  lvUses: [0, 4, 8, 18, 26], // Lv 1–5
  hard: { gain: 1.6, sta: 2, fail: 0.15 },
  streak: { step: 0.05, max: 0.2 },
  gates: [80, 90], // a stat stops here until its Limit Break trial is passed
  injuryAt: 25, // stamina below this: a failed session may injure you
  physio: 30, // skill points to heal an injury at once
  /**
   * Training gives experience; a stat goes up a point each time its XP reaches `need` — which grows exponentially
   * with the stat: base × grow^(value − from). XP from a session = the training's base gain × per × every multiplier
   * (place quality, facility level, mood, streak, teammates, camp, Hard…). Wit counts in 0.02 steps (level = wit × 50).
   */
  xp: { per: 10, base: 10, grow: 1.05, from: 50 }
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
/** Coach's goal for each block of the season (evaluated at the block's last week). */
const BLOCKS = [6, 12, 18, 24, 28];
const GOAL_REWARD = { sp: 40, fans: 300 };
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
/** Challenge modes chosen at creation (optional handicaps). */
const MODES = {
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
  warmupWin: { sp: 40, fans: 500, bond: 5 },
  warmupLoss: { sp: 20, fans: 100, bond: 0 },
  cupWin: { sp: 60, fans: 1500, bond: 5 },
  perPlay: { sp: 2, fans: 20 } // each of your kills, blocks and aces
};
const RANKS = [
  ['S', 10000],
  ['A', 7000],
  ['B', 4000],
  ['C', 0]
];
