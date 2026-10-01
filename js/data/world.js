// Career world: the island's regions and factions (two squads per major, two minors), join conditions, money,
// housing and paydays.
// Names are placeholders; balance is not tuned yet.

/**
 * The island's powers. Three majors hold clear borders (Wei the city, Wu the beach, Shu the highlands);
 * minors have no border of their own — a patch inside or across the majors' land. Each region prices and equips
 * its places its own way: price × the base fee; q = training quality; hype = chance a premium (Wei) place is
 * overhyped (really just average); gem = chance a rough (Shu) place is a hidden gem;
 * color = map colour; at = the region's anchor on the map; hotel = a night's price there (× nothing: already local).
 */
const REGIONS = {
  wei: {
    color: '#f5b82e',
    at: [700, 300],
    name: 'Wei Dynasty',
    kind: 'major',
    price: 2,
    q: 1.25,
    hype: 0.3,
    desc: 'The city: top facilities at top prices — not all of them live up to it'
  },
  wu: {
    color: '#3fa9f5',
    at: [470, 585],
    name: 'Wu Navy',
    kind: 'major',
    price: 1,
    q: 1,
    desc: 'The coastline: mid prices, mid facilities; the sand courts are the best place to build technique'
  },
  shu: {
    color: '#4ade80',
    at: [300, 290],
    name: 'Shu Highlands',
    kind: 'major',
    price: 0.5,
    q: 0.8,
    gem: 0.15,
    desc: 'Mountain towns far from the city: everything cheap and rough — now and then a hidden gem'
  },
  outlaws: {
    color: '#ff8c42',
    at: [815, 470],
    name: 'Street Outlaws',
    kind: 'minor',
    price: 1,
    q: 1,
    desc: 'Cages and courts under the overpass, on the Wei–Wu line'
  },
  gloria: {
    color: '#ff5da2',
    at: [690, 255],
    name: 'St. Gloria',
    kind: 'minor',
    price: 3,
    q: 1.35,
    desc: 'A private club inside the city: the best money can buy'
  },
  open: {
    color: '#f5e6a8',
    at: [500, 300],
    name: 'Central Academy',
    kind: 'none',
    price: 1,
    q: 0.9,
    desc: 'Neutral ground by charter. Every newcomer enrols here. No faction may train, recruit or fight on campus.'
  }
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
  place: { 'Round of 16': 50, Quarterfinal: 100, Semifinal: 200, Final: 400, Champion: 800 } // × the cup's multiplier
};
/**
 * Housing (region: where it is on the island): rent per payday; rest = stamina from a Rest week ×; moodPay = mood
 * change on payday (chance); sick = weekly chance of a cold (−15 stamina); noise = weekly chance of a bad night
 * (mood −1); grit = leadership per payday.
 */
const HOUSING = {
  homeless: {
    name: 'Abandoned gym',
    region: 'wei',
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
 * Street battles between the majors: chance a training week opens with one; sites (map point).
 * Fighting is a real match (Cup.clash); standing with the side you fought for +win / +lose, and always `other`
 * with the side you fought against. Watching scouts both sides' clubs.
 */
const CLASH = {
  chance: 0.45,
  sites: [
    { a: 'wei', b: 'wu', at: [860, 330], name: 'the contested border' },
    { a: 'wei', b: 'shu', at: [490, 130], name: 'the northern ridge' },
    { a: 'wu', b: 'shu', at: [395, 540], name: 'the southern plain' }
  ],
  sta: 15,
  watchSta: 5,
  win: 10,
  lose: -5,
  other: -10,
  fans: 60
};
/**
 * Faction dynamics (Front): each major border has 2 places per side that can be seized (the rest is heartland).
 * seize = net battle wins on a border to take a place; a faction with weakAt+ places lost is weakened. Per place
 * lost: prices +price, quality −q (+q per place taken), club join needs −join (OVR / key stat), fee −fee.
 * aggro = who starts street battles (+revenge for last battle's loser; the raider gets +initiative).
 */
const FRONT = {
  borders: {
    'wei-wu': { wei: ['weiSpeed', 'weiWit'], wu: ['harbor', 'dunes'] },
    'wei-shu': { wei: ['weiPower', 'weiJump'], shu: ['dojo', 'steps'] },
    'wu-shu': { wu: ['sand', 'pier'], shu: ['shrine', 'stone'] }
  },
  seize: 2,
  weakAt: 2,
  price: 0.1,
  q: 0.04,
  join: 3,
  fee: 0.25,
  aggro: { wu: 0.5, wei: 0.3, shu: 0.2 },
  revenge: 0.2,
  initiative: 10 // the raiding side's edge (street strength) in a battle nobody joins
};
/**
 * Facility access: a place refuses you if your standing with its owner is at or below `grudge`, or you miss the
 * owner's condition (same fields as a club's `join`: ovr, key, star, fans). Members of the owner always get in.
 */
const ACCESS = {
  grudge: -20,
  cond: { wei: {}, wu: {}, shu: {}, outlaws: {}, gloria: {} }
};
/** Faction pool sizes (players, league-team players included): the rest are generated reserves. */
const POOL = { wei: 24, wu: 18, shu: 12, outlaws: 6, gloria: 6 };
/**
 * Team challenges (City.worth / City.challenge / Cup.challenge; spec §4.15). A club accepts when your worth reaches its
 * rating − margin: worth = your side's rating + standing ÷ standPer + a term from the faction's dogma (lore.md §5):
 * Wei: +gazette in the Gazette Top 20, + fans ÷ fansPer, + stake ÷ stakePer; Wu: (key stat − 50) ÷ keyPer (the stake counts
 * for nothing); Shu: standing ÷ repPer + week ÷ weekPer (no stake); Outlaws: any stake ≥ minStake, else refused; Gloria:
 * only from the Top 20. Within `doubt` below the bar it is "doubtful" (a fixed per-week/club/stake hash decides, `doubtP`
 * accepts). stakeStep: the stake stepper; odds: payout × stake, from the rating gap (1.5 + gap ÷ 20, clamped); hire: the
 * street crew you pay for when alone (rating `ovr`, `cost` from your money); refuseMax: refusals before you are a pest
 * (standing `pest` on each further one).
 */
const CHALLENGE = {
  margin: 6,
  standPer: 10,
  doubt: 3,
  doubtP: 0.5,
  stakeStep: 50,
  odds: [1.2, 3],
  hire: { ovr: 50, cost: 80 },
  refuseMax: 3,
  pest: -8,
  wei: { gazette: 8, fansPer: 1000, stakePer: 100 },
  wu: { keyPer: 5 },
  shu: { repPer: 10, weekPer: 4 },
  outlaws: { minStake: 50 },
  gloria: {}
};
/**
 * Losing a team challenge or a street fight (spec §4.15), applied by Cup.lose: extra stamina `sta` and `mood` (carry over),
 * standing `rep` with the faction you lost to (challenges only), `repeatRep` more from the `repeat`-th loss to it (run.losses);
 * a loss by `heavy`+ points costs `fans` and earns a Gazette jab (GAZETTE_JABS).
 */
const LOSS = { sta: 20, mood: -1, rep: -6, repeat: 3, repeatRep: -6, heavy: 8, fans: -150 };
/**
 * Injury after every challenge / street fight, won or lost (City.injuryRisk, Cup.injure): chance = base + max(0, their rating −
 * yours) × perGap + points lost by × perPoint + (1 − stamina share) × sta + max(0, cool − days since your last fight) × perDay,
 * clamped to [0, max]. A second roll gives the severity (< sev[0] minor, < sev[1] serious, else severe: also −`lose` for good on
 * one stat); `weeks` of light training per severity. Evaluations and cups carry no injury roll.
 */
const INJURY = {
  base: 0.03,
  perGap: 0.006,
  perPoint: 0.01,
  sta: 0.15,
  cool: 3,
  perDay: 0.04,
  max: 0.45,
  sev: [0.65, 0.92],
  weeks: { minor: 1, serious: 2, severe: 3 },
  lose: 2
};
/** The Gazette's jab after a heavy loss (wei voice); {name} = you, {club} = who beat you. */
const GAZETTE_JABS = [
  '{club} make an example of {name}. The office expected nothing less.',
  '{name} went looking for a fight with {club}. The Gazette notes the result.',
  'Order holds: {club} send {name} home with a lesson.'
];
/** What the challenge card says (registrar voice; numbers stay hidden) per faction and verdict, and each faction's refusal lines. */
const CHALLENGE_WHY = {
  wei: {
    likely: 'They respect fame and money',
    doubtful: 'They want more fame or a bigger stake',
    refuses: 'They see no fame and little money'
  },
  wu: { likely: 'They respect strength', doubtful: 'They doubt your strength', refuses: 'They think you too weak' },
  shu: { likely: 'The elders know your name', doubtful: 'The elders are not sure of you', refuses: 'The elders have not seen you suffer' },
  outlaws: { likely: 'A bet is a bet', doubtful: 'A bet is a bet', refuses: 'No stake, no game' },
  gloria: { likely: 'You are on their list', doubtful: 'You are on their list', refuses: 'Invitation only' },
  week: 'They will not hear you again this week'
};
const CHALLENGE_LINES = {
  wei: ['The office does not take calls from nobodies.', 'Come back when the Gazette knows your name.'],
  wu: ['Weak arms do not get a game.', 'Go lift something, then ask again.'],
  shu: ['The elders have not seen your hardship.', 'Wait. Bleed a little, then ask again.'],
  outlaws: ['No stake, no game. We do not play for free.', 'A bet is a bet. Bring one.'],
  gloria: ['We do not recall inviting you.', 'Invitations are sent. They are not requested.']
};
/**
 * Rankings (Rank, js/career/rank.js): top = Gazette length; weiFame = Wei players' fame multiplier (only Wei-sanctioned
 * matches count); fame = NPC fame points (star, OP, awakened element, per team win); street = street points (you: a
 * street battle fought + a win, a hustle won; a settled battle gives its winner faction's `share` best players `faction`).
 */
const RANK = {
  top: 20,
  weiFame: 1.5,
  fame: { star: 30, op: 80, el: 20, win: 3 },
  street: { fight: 10, win: 15, hustle: 3, faction: 2, share: 4 }
};
/** Players in a squad: 4 on court + 2 on the bench. */
const SQUAD = 6;
/**
 * Squad draw weights: weight = max(minW, (ovr − floor) / span); your weight × (1 + max(0, standing) / repPer);
 * standing ≥ sure → you are always drawn.
 */
const DRAW = { floor: 40, span: 20, minW: 0.1, repPer: 50, sure: 60 };
/** Reserve promotion on payday: a faction's best reserve replaces a weaker same-role squad player if it beats their OVR by at least `gap`. */
const PROMOTE = { gap: 3 };
/** A night at a hotel away from home: base price (× the region's price). */
const HOTEL = { price: 12, rest: 1 };
