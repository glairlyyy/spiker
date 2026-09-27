// Career mode constants: creation budget, trainings, mood levels, calendar, rewards, ranks, Legacy unlocks.

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
const CALENDAR = { 6: 'warmup', 12: 'warmup', 18: 'warmup2', 22: 'camp', 23: 'camp', 24: 'camp', 27: 'warmup2', 28: 'camp' };
/** The two major cups: played after week `after`. The Grand Cup is seeded by rating and pays more. */
const CUPS = [
  { id: 'skyline', after: 24, name: 'Skyline Cup', short: 'SC', mul: 1 },
  { id: 'grand', after: 28, name: 'Grand Cup', short: 'GC', mul: 1.5, seeded: true }
];
/** Placement rewards when a cup ends for you (× the cup's mul). */
const PLACES = {
  Quarterfinal: { fans: 300, sp: 20 },
  Semifinal: { fans: 800, sp: 40 },
  Final: { fans: 1500, sp: 60 },
  Champion: { fans: 3000, sp: 90 }
};
const DOUBLE_CROWN = 10; // Legacy points for winning both cups
/** Training depth: facility levels (uses needed per level), Hard option, streaks, limit-break gates. */
const TRAIN_X = {
  lvUses: [0, 4, 8, 18, 26], // Lv 1–5
  hard: { gain: 1.6, sta: 2, fail: 0.15 },
  streak: { step: 0.05, max: 0.2 },
  gates: [80, 90], // a stat stops here until its Limit Break trial is passed
  injuryAt: 25, // stamina below this: a failed session may injure you
  physio: 30 // skill points to heal an injury at once
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
  WS: [['k', '4+ kills', 'k', 4], ['ace', '2+ aces', 'ace', 2], ['clean', 'At most 1 error', 'err', 1]],
  MB: [['blk', '2+ blocks', 'blk', 2], ['k', '3+ kills', 'k', 3], ['clean', 'At most 1 error', 'err', 1]],
  S: [['ast', '6+ assists', 'ast', 6], ['dig', '3+ digs', 'dig', 3], ['clean', 'At most 1 error', 'err', 1]]
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
  iron: { name: 'IronWorks Gym', perk: 'Power and Defense training +10%', cond: 'Train (not rest) in 3 of the next 4 weeks', kind: 'train', weeks: 4 },
  spike: { name: 'Spike TV', perk: '+20% fans from matches', cond: 'Grade A or better in your next match', kind: 'grade' }
};
/** Challenge modes chosen at creation: harder runs pay more Legacy points. */
const MODES = {
  hard: { name: 'Hard league', desc: 'Every other player starts stronger and grows faster.', legacy: 1.3 },
  short: { name: 'Short season', desc: 'Start at week 5 — four fewer training weeks.', legacy: 1.2 }
};
const PURE_BONUS = 1.25; // Legacy points for a run with every unlock switched off
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
const LEGACY_PER_FANS = 500;
const UNLOCKS = [
  { id: 'budget1', name: 'Extra budget I', cost: 5, desc: '+5 creation points' },
  { id: 'budget2', name: 'Extra budget II', cost: 10, desc: '+5 creation points', need: 'budget1' },
  { id: 'budget3', name: 'Extra budget III', cost: 20, desc: '+5 creation points', need: 'budget2' },
  { id: 'fresh', name: 'Fresh legs', cost: 8, desc: 'Stamina cap 120' },
  { id: 'scout', name: 'Scout', cost: 10, desc: "See your team's players before joining" },
  { id: 'head', name: 'Head start', cost: 12, desc: 'Start with one skill of your choice' },
  { id: 'pick', name: 'Team pick', cost: 15, desc: 'Choose your team instead of random' },
  // start-of-run boosts
  { id: 'vibes', name: 'Good vibes', cost: 6, desc: 'Start every run in Great mood' },
  { id: 'fans', name: 'Fan club', cost: 8, desc: 'Start with 1,000 fans' },
  { id: 'fund', name: 'Skill fund', cost: 8, desc: 'Start with 100 skill points' },
  { id: 'leader', name: 'Born leader', cost: 10, desc: '+20 leadership at the start (captain material)' },
  { id: 'gym', name: 'Veteran coach', cost: 10, desc: 'Every training starts at facility Lv 2' },
  { id: 'bonded', name: 'Old friends', cost: 12, desc: 'Start with 30 bond with every teammate' },
  { id: 'spurt', name: 'Growth spurt', cost: 14, desc: 'Creation cap 75 per stat (instead of 70)' },
  { id: 'eye', name: 'Talent eye', cost: 14, desc: 'Your teammates have higher hidden potential (grow faster)' },
  { id: 'home', name: 'Home crowd', cost: 16, desc: 'Your team starts every Cup match fired up (+mood)' },
  // teammates
  { id: 'starmate', name: 'Star teammate', cost: 18, desc: 'One teammate starts as a ★ star' },
  { id: 'starmate2', name: 'Star duo', cost: 30, desc: 'Two teammates start as ★ stars', need: 'starmate' },
  { id: 'opmate', name: 'OP teammate', cost: 45, desc: 'One teammate starts as an OP red star', need: 'starmate' }
];
