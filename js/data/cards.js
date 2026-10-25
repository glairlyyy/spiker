// Semi-automatic matches (spec §2.31–§2.33, §2.37): the bars (HP, morale traits), turns and the deck of tactic cards. Data only —
// the engine is js/engine/bars.js and js/engine/cards.js. First numbers, measured (npm run cards), not tuned yet (T-348).

/**
 * HP (spec §2.31): every kept-up serve receive / dig takes `base` × (r / r0)^exp (r = ball power / the receiver's Defense as
 * played; r0 = a typical ball in every league: power ≈ 0.72 × Defense), at most `max`. At 0: collapse (the knockdown). After
 * every rally court players heal `heal` (a collapsed one back to at least `up`), the bench all of it. Low HP drains stamina
 * × 1 + drain × (1 − hp). Calibrated (owner, 2026-10-16): an average player goes down on the 2nd or 3rd hit of a rally.
 */
const HP = { base: 0.45, r0: 0.72, exp: 1.55, max: 1.5, heal: 0.35, up: 0.5, drain: 0.5 };

/**
 * Morale traits (spec §2.31), by hash of the player (`share` of all players each; the rest have none). up: their own error /
 * being stuffed (Spiteful); lost: × on a lost point; shake: × on marathons and hard kills; kill: + on their own kill; mates:
 * × on a point a teammate's kill won; lift: the lowest teammate's morale on a lost point (Anchor); late: [gain ×, loss ×]
 * late in the set; swing: × on every gain and loss; hp: × HP damage; early: [gain × before TRAIT_EARLY points, after];
 * under: gain × while the weaker side (OVR); taunt: an opponent's error costs that opponent this much more.
 */
const MTRAITS = {
  spiteful: { name: 'Spiteful', share: 0.1, up: 0.15, lost: 0.5, tip: 'errors and stuffs fire them up' },
  glass: { name: 'Glass', share: 0.06, shake: 2, tip: 'marathons and hard kills shake them twice as hard' },
  showboat: { name: 'Showboat', share: 0.08, kill: 0.15, mates: 0.5, tip: 'lives for their own kills' },
  anchor: { name: 'Anchor', share: 0.08, lost: 0.7, lift: 0.08, tip: 'holds steady and lifts the lowest teammate' },
  stubborn: { name: 'Stubborn', share: 0.06, tip: 'plays their own game: ignores what a card forces' },
  // (owner, 2026-10-17, T-304)
  clutch: { name: 'Clutch', share: 0.08, late: [1.5, 0.5], tip: 'rises late in the set' },
  hothead: { name: 'Hothead', share: 0.08, swing: 1.5, tip: 'every point hits them half again as hard, up or down' },
  iron: { name: 'Iron Body', share: 0.07, hp: 0.7, tip: 'takes 30 % less HP damage' },
  slow: { name: 'Slow Starter', share: 0.06, early: [0.5, 1.3], tip: 'slow to warm up, strong once going' },
  underdog: { name: 'Underdog', share: 0.07, under: 1.4, tip: 'fires up against a stronger side' },
  trash: { name: 'Trash Talker', share: 0.06, taunt: 0.08, tip: 'every opponent error stings them more' },
  choker: { name: 'Choker', share: 0.05, late: [0.5, 2], tip: 'tightens up late in the set' }
};
/** "Late" for Clutch / Choker / Ice Veins: either side at this many points (spec §2.31). Slow Starter: the first `early` points played. */
const TRAIT_LATE = 12,
  TRAIT_EARLY = 8;

/** Turns (spec §2.32): every `pts` points played the hands refill (a timeout: an extra turn for its side). */
const TURN = { pts: 6 };
/**
 * The deck (spec §2.37): `size` cards per side, the squad's own first (an OP player's card by role `op`, an element player's
 * Element Surge; duo cards; the captain's playbook `books` by team style — the first `book[0]` with a captain's read below `iq`,
 * `book[1]` at or above; techniques by holders on court; traits), Basics (`basics`, in turn) filling the rest; a hand of
 * `hand`. Holder level (a technique's edge and buffs × it): the holders' action level (SKILL.use) / `lv.ref`, within [lv.min,
 * lv.max]. `strong`: a cooldown this long marks a strong card (the captain saves it).
 */
const DECK = {
  size: 12,
  hand: 5,
  basics: ['isrv', 'iatk', 'iset', 'iblk', 'idig', 'ifake'], // the amplifiers (spec §2.37 Amplifiers and fusing, T-358)
  op: { WS: 'god', MB: 'titan', S: 'inzone' },
  books: {
    power: ['power', 'deep', 'stand'],
    wall: ['wall', 'commit', 'bait'],
    tempo: ['quick', 'beat', 'feedhot'],
    counter: ['deep', 'sdig', 'strap'],
    sky: ['power', 'rset', 'stand'],
    bombers: ['float', 'short', 'beat'],
    mind: ['beat', 'cover', 'talk'],
    balanced: ['power', 'cover', 'tip']
  },
  book: [2, 3],
  // each style's duel card (spec §2.39, T-367), in the deck after its playbook
  duelBook: { bombers: 'pressure', mind: 'disguise', tempo: 'dtempo', wall: 'hide', counter: 'hide' },
  iq: 0.7,
  lv: { ref: 65, min: 0.6, max: 1.2 },
  strong: 13,
  tech: 0.5, // an owned technique's own rate (spec §2.37, T-358): × today's chance — on some rallies only (engine/skills.js techOn)
  // amplifiers: `rate` added to their group's technique rate while active; Improve X+ is each of its two at `plus`; a technique card
  // active with its group's amplifier: edges × `with`; a full form (amplifier + technique fused): the technique's edges and buffs × `full`
  amp: { rate: 0.25, plus: 0.8, with: 1.25, full: 1.5 },
  mine: 6, // a non-captain career player's own deck (spec §2.37 Your hand, T-349): picked in match prep, Basics fill
  myHand: 3, // … and their hand
  // duel cards (spec §2.39, T-367): a borrowed technique (a teammate's, the hesitating player has not learned it) costs × borrow;
  // Target Serve: exact, the receive − target;
  // Tempo: block coverage ×; Disguise: [coverage ×, errors ×]; Commit (right): coverage ×; Read Block: coverage ×; Pressure / Hide: serves
  duel: { borrow: 2, target: 20, tempo: 0.7, disguise: [0.75, 0.9], commit: 1.5, read: 1.2, serves: 3 }
};
/**
 * Requests (spec §2.37, T-349): at a turn (until `win` points after it) a non-captain asks the captain for one team play from
 * their hand, once a turn. Yes odds = base + bond × bond / 100 (their bond with you, 0–100) + trust (trusted) + fit (the card's
 * read holds now) or mis (it does not) − cool (for `coolT` turns after a granted card was played into its counter or caught),
 * within [min, max]; shown as likely (≥ likely) / maybe (≥ maybe) / unlikely. Trusted (career): `trustWeeks`+ weeks at the club
 * or a bond of `trustBond`+ with the captain. No bond loss either way.
 */
const REQ = {
  win: 1,
  base: 0.25,
  bond: 0.45,
  trust: 0.15,
  fit: 0.15,
  mis: -0.1,
  cool: 0.3,
  coolT: 3,
  min: 0.05,
  max: 0.95,
  likely: 0.6,
  maybe: 0.35,
  trustWeeks: 8,
  trustBond: 40
};

/**
 * The tactic cards (spec §2.33, §2.37). zone: 'atk' | 'def' | 'op' (what it plays on; the hand's colour band). kind: 'basic'
 * (small, 1 point) | 'play' | 'once' (instant: `on`, then cools) | 'trap' (`trap`: armed `dur` points — the other side's card it
 * names is caught when played: cost paid, no effect) | 'op' (once a match) | 'duel' (only in a hesitation, spec §2.39: `duel`). src: 'base' (Basics: fill the deck) | 'book' (the
 * captain's playbook, DECK.books) | 'tech' (a squad player owns `need`) | 'trait' (trait `trait`) | 'op' (DECK.op / element players) |
 * 'duo' (m.duo[side][id] = the pair's ids, both on court). Played (js/engine/cards.js) it acts for `dur` points (`per: 'srv'`: your
 * serves), then cools `cd` points in the discard pile (OP: used up). cost / after = { who: 'holder' | 'captain' | 'court', bar:
 * 'sta' | 'hp' | 'mor', amt } paid on play / when it ends. What it does while active: buff — stat → % (atk = power in play,
 * def, spd, jump, serve; with `need` only for its holders, `needT` only for that trait, `self` only for the holders who played it;
 * `when`: a CARD_FIT read that must hold); plan — { atk | def } team plan (PLANS); tac — the tactic (TACTICS); ord — [kind,
 * value] role order for its players (`who`: 'holders' | 'mb' | 'hitters' | 'setter' | 'all'; value 'weak' = their weakest passer,
 * 'hot' = our hitter with the highest morale); force — the technique always fires for its holders; on — on play: 'surge' (full
 * element gauges, again each point while active) | 'taunt' | 'wind' | 'talk' | 'inzone' (js/engine/cards.js cardOn). clean: a
 * strong / OP card cuts its holders' mistakes by this % while active (Formula.errK, spec §2.38). grp: one
 * active card of a group at a time. tally: the rallies its fit / countered tally reads — 'serve' | 'recv' | 'attack' | 'defend'.
 */
const CARDS = {
  // Amplifiers (spec §2.37, T-358; they replace the Basics and fill the deck): cheap and short; each lifts its action a little and
  // makes its group's techniques (SKILLS[id].grp) fire more (DECK.amp.rate) and hit harder (`hit`: only for a player whose
  // technique of that group is on this rally). `foe`: % on the other side's stat.
  isrv: {
    name: 'Improve Serve',
    zone: 'atk',
    kind: 'basic',
    src: 'base',
    amp: 'serve',
    buff: { serve: 12 },
    hit: { serve: 8 },
    desc: 'Serve +12 %; serve techniques fire more, hit harder'
  },
  iatk: {
    name: 'Improve Attack',
    zone: 'atk',
    kind: 'basic',
    src: 'base',
    amp: 'attack',
    buff: { atk: 12 },
    hit: { atk: 8 },
    desc: 'Power +12 %; attack techniques fire more, hit harder'
  },
  iset: {
    name: 'Improve Set',
    zone: 'atk',
    kind: 'basic',
    src: 'base',
    amp: 'set',
    buff: { set: 6 },
    hit: { atk: 8 },
    desc: 'Cleaner sets: good set +6 %; set techniques fire more'
  },
  iblk: {
    name: 'Improve Block',
    zone: 'def',
    kind: 'basic',
    src: 'base',
    amp: 'block',
    buff: { jump: 12 },
    hit: { jump: 8 },
    desc: 'Jump +12 %; block techniques fire more, hit harder'
  },
  idig: {
    name: 'Improve Dig',
    zone: 'def',
    kind: 'basic',
    src: 'base',
    amp: 'dig',
    buff: { spd: 12 },
    hit: { def: 8 },
    desc: 'Speed +12 %; dig techniques fire more, hit harder'
  },
  ifake: {
    name: 'Improve Fake',
    zone: 'atk',
    kind: 'basic',
    src: 'base',
    amp: 'fake',
    foe: { jump: -9 },
    hit: { atk: 8 },
    desc: 'Their block −9 %; fakes and decoys fire more'
  },
  // Fused cards (spec §2.37 Fusing in the hand, T-358): never in a deck — two hand cards that make a recipe (`parts`) fuse into one,
  // played as one: both parts' effects (each × `pk`, default 1) plus the card's own, both costs on play, both parts cool after.
  // Improve X+ (an amplifier twice) is built below; the full forms (an amplifier + a technique of its group) in js/data/skills.js.
  fortress: {
    name: 'Fortress',
    zone: 'def',
    kind: 'play',
    src: 'fuse',
    parts: ['iblk', 'idig'],
    buff: { def: 12 },
    tally: 'defend',
    desc: 'Block and dig as one: defense +12 % more'
  },
  decoy: {
    name: 'Decoy',
    zone: 'atk',
    kind: 'play',
    src: 'fuse',
    parts: ['ifake', 'iatk'],
    foe: { jump: -12 },
    tally: 'attack',
    desc: 'The fake sells the swing: their block −12 % more'
  },
  pwall: {
    name: 'Pressure Wall',
    zone: 'def',
    kind: 'play',
    src: 'fuse',
    parts: ['isrv', 'iblk'],
    foe: { def: -9 },
    tally: 'defend',
    desc: 'Serve them off the net into a set block: their defense −9 %'
  },
  tempo: {
    name: 'Tempo',
    zone: 'atk',
    kind: 'play',
    src: 'fuse',
    parts: ['iset', 'iatk'],
    buff: { atk: 12 },
    tally: 'attack',
    desc: 'Fast sets, early swings: power +12 % more'
  },
  scramble: {
    name: 'Scramble',
    zone: 'def',
    kind: 'play',
    src: 'fuse',
    parts: ['idig', 'iset'],
    buff: { spd: 12 },
    tally: 'defend',
    desc: 'Dig it, set it from anywhere: speed +12 % more'
  },
  fbait: {
    name: 'Bait',
    zone: 'def',
    kind: 'play',
    src: 'fuse',
    parts: ['ifake', 'iblk'],
    foe: { atk: -12 },
    tally: 'defend',
    desc: 'Show a gap, close it: their power −12 %'
  },
  // the old pairs (§2.33 combos)
  sniper: {
    name: 'Sniper',
    zone: 'atk',
    kind: 'play',
    src: 'fuse',
    parts: ['killer', 'target'],
    need: 'killer',
    buff: { serve: 12 },
    tally: 'serve',
    desc: 'Killer serves at their weakest passer: serve +12 % more'
  },
  lockdown: {
    name: 'Lockdown',
    zone: 'def',
    kind: 'play',
    src: 'fuse',
    parts: ['wall', 'commit'],
    buff: { jump: 12 },
    tally: 'defend',
    desc: 'Wall their ace, middles committed: jump +12 % more'
  },
  ifloor: {
    name: 'Iron Floor',
    zone: 'def',
    kind: 'play',
    src: 'fuse',
    parts: ['sdig', 'idig'], // (owner, 2026-10-24: Speed Dig + Dig Deep never fit together — Speed Dig's soft-attack read)
    buff: { def: 12 },
    tally: 'defend',
    desc: 'A middle back, quick feet on a soft attack: defense +12 % more'
  },
  ftempo: {
    name: 'Freak Tempo',
    zone: 'atk',
    kind: 'play',
    src: 'fuse',
    parts: ['quick', 'freak'],
    buff: { atk: 12 },
    tally: 'attack',
    desc: 'Quick tempo for the freak quick: power +12 % more'
  },
  stempo: {
    name: 'Slide Tempo',
    zone: 'atk',
    kind: 'play',
    src: 'fuse',
    parts: ['quick', 'slide'],
    buff: { atk: 12 },
    tally: 'attack',
    desc: 'Quick tempo for the slide: power +12 % more'
  },
  // the captain's playbook
  power: {
    name: 'Power Through',
    zone: 'atk',
    kind: 'play',
    src: 'book',
    plan: { atk: 'power' },
    grp: 'aplan',
    tally: 'attack',
    desc: 'Swing hard, ignore the block'
  },
  beat: {
    name: 'Beat the Block',
    zone: 'atk',
    kind: 'play',
    src: 'book',
    plan: { atk: 'beat' },
    grp: 'aplan',
    tally: 'attack',
    desc: 'Hit away from their read'
  },
  quick: { name: 'Quick Tempo', zone: 'atk', kind: 'play', src: 'book', tac: 'mb', tally: 'attack', desc: 'Middles go quick' },
  tip: {
    name: 'Tip & Roll',
    zone: 'atk',
    kind: 'play',
    src: 'book',
    ord: ['shot', 'tip'],
    who: 'hitters',
    grp: 'shot',
    tally: 'attack',
    desc: 'Soft shots over the block'
  },
  wall: {
    name: 'Wall Their Ace',
    zone: 'def',
    kind: 'play',
    src: 'book',
    plan: { def: 'wall' },
    grp: 'dplan',
    tally: 'defend',
    desc: 'Block their best hitter'
  },
  cover: {
    name: 'Cover the Weak Link',
    zone: 'def',
    kind: 'play',
    src: 'book',
    plan: { def: 'cover' },
    grp: 'dplan',
    tally: 'recv',
    desc: 'Protect our weakest passer'
  },
  deep: {
    name: 'Dig Deep',
    zone: 'def',
    kind: 'play',
    src: 'book',
    plan: { def: 'deep' },
    grp: 'dplan',
    tally: 'defend',
    desc: 'Block the line, floor back'
  },
  commit: {
    name: 'Commit',
    zone: 'def',
    kind: 'duel',
    duel: { on: 'blk', opt: 'commit' },
    src: 'book',
    ord: ['blk', 'commit'],
    who: 'mb',
    grp: 'blk',
    tally: 'defend',
    desc: 'In a hesitation: commit on their hitter — right, the block +50 %'
  },
  // duel cards (spec §2.39, T-367): played only in a hesitation (kind 'duel', `duel`: { on: the duel 'srv' | 'atk' | 'blk', opt:
  // the option it plays — 'aim' a passer / the seam, 'fight', 'avoid', 'read', 'commit' — or vs: the other side's card })
  pressure: {
    name: 'Pressure',
    zone: 'atk',
    kind: 'duel',
    duel: { on: 'srv', opt: 'aim' },
    src: 'book',
    tally: 'serve',
    desc: 'In a hesitation: the aimed serve — that passer does not settle for 3 serves'
  },
  hide: {
    name: 'Hide',
    zone: 'def',
    kind: 'duel',
    duel: { on: 'srv', vs: 1 },
    src: 'book',
    tally: 'recv',
    desc: 'Their server hesitates: your weak passer screened for 3 serves'
  },
  dtempo: {
    name: 'Tempo',
    zone: 'atk',
    kind: 'duel',
    duel: { on: 'atk', opt: 'fight' },
    src: 'book',
    tally: 'attack',
    desc: 'In a hesitation: fight the block on a fast set — it comes up late, coverage −30 %'
  },
  disguise: {
    name: 'Disguise',
    zone: 'atk',
    kind: 'duel',
    duel: { on: 'atk', opt: 'avoid' },
    src: 'book',
    tally: 'attack',
    desc: 'In a hesitation: avoid the block, the shot hidden — coverage −25 %, errors −10 %'
  },
  sdig: {
    name: 'Speed Dig',
    zone: 'def',
    kind: 'play',
    src: 'book',
    ord: ['blk', 'back'],
    who: 'mb',
    buff: { spd: 10 },
    grp: 'blk',
    tally: 'defend',
    desc: 'A middle stays back to dig; Speed +10 %'
  },
  // techniques (a squad player owns it)
  killer: {
    name: 'Killer Serve',
    zone: 'atk',
    kind: 'play',
    src: 'tech',
    need: 'killer',
    ord: ['srv', 'killer'],
    who: 'holders',
    buff: { serve: 5 },
    grp: 'srv',
    tally: 'serve',
    desc: 'Every holder fires Killer Jump Serve; serve +5 %'
  },
  drive: {
    name: 'Drive Serve',
    zone: 'atk',
    kind: 'play',
    src: 'tech',
    need: 'drive',
    ord: ['srv', 'drive'],
    who: 'holders',
    buff: { serve: 3 },
    grp: 'srv',
    tally: 'serve',
    desc: 'Every holder fires Drive Serve; serve +3 %'
  },
  target: {
    name: 'Target Serve',
    zone: 'atk',
    kind: 'duel',
    duel: { on: 'srv', opt: 'aim' },
    src: 'tech',
    need: 'target',
    who: 'holders',
    buff: { serve: 2 },
    tally: 'serve',
    desc: 'In a hesitation: the aimed serve lands exact on the spot — no aim error, their pass −20'
  },
  delay: {
    name: 'Delayed Spike',
    clean: 20,
    zone: 'atk',
    kind: 'play',
    src: 'tech',
    need: 'delay',
    force: 1,
    buff: { atk: 4 },
    tally: 'attack',
    desc: 'Holders hang every time they can'
  },
  cutshot: {
    name: 'Cut Shot',
    zone: 'atk',
    kind: 'play',
    src: 'tech',
    need: 'cutshot',
    force: 1,
    buff: { atk: 3 },
    tally: 'attack',
    desc: 'Holders cut round the block more'
  },
  freak: {
    name: 'Freak Quick',
    clean: 20,
    zone: 'atk',
    kind: 'play',
    src: 'tech',
    need: 'freak',
    force: 1,
    buff: { atk: 4 },
    tally: 'attack',
    desc: 'Minus-tempo quick whenever it is on'
  },
  slide: {
    name: 'Slide',
    clean: 20,
    zone: 'atk',
    kind: 'play',
    src: 'tech',
    need: 'slide',
    force: 1,
    buff: { atk: 4 },
    tally: 'attack',
    desc: 'The slide whenever it is on'
  },
  sync: {
    name: 'Sync Attack',
    zone: 'atk',
    kind: 'play',
    src: 'tech',
    need: 'sync',
    force: 1,
    buff: { atk: 3 },
    tally: 'attack',
    desc: 'Everyone approaches on a perfect pass'
  },
  lefty: {
    name: 'Lefty Dump',
    zone: 'atk',
    kind: 'play',
    src: 'tech',
    need: 'lefty',
    buff: { jump: 4 },
    tally: 'attack',
    desc: 'The setter dumps sharper'
  },
  pipecombo: {
    name: 'Pipe Combo',
    zone: 'atk',
    kind: 'play',
    src: 'tech',
    need: 'pipecombo',
    force: 1,
    buff: { atk: 3 },
    tally: 'attack',
    desc: 'The pipe combo on every back-row set'
  },
  readblk: {
    name: 'Read Block',
    clean: 20,
    zone: 'def',
    kind: 'duel',
    duel: { on: 'blk', opt: 'read' },
    src: 'tech',
    need: 'readblk',
    buff: { jump: 6 },
    tally: 'defend',
    desc: 'In a hesitation: read the set, in time even on the quick; block +20 %'
  },
  softblk: {
    name: 'Soft Block',
    clean: 20,
    zone: 'def',
    kind: 'play',
    src: 'tech',
    need: 'softblk',
    buff: { def: 6 },
    tally: 'defend',
    desc: 'Holders defend +6 %'
  },
  // traits
  spite: {
    name: 'Spite Spike',
    zone: 'atk',
    kind: 'play',
    src: 'trait',
    trait: 'spiteful',
    buff: { atk: 10 },
    when: 'behind',
    tally: 'attack',
    desc: 'Power +10 % while behind'
  },
  hold: {
    name: 'Hold the Line',
    zone: 'def',
    kind: 'play',
    src: 'trait',
    trait: 'anchor',
    buff: { def: 8 },
    when: 'behind',
    tally: 'defend',
    desc: 'Defense +8 % while behind'
  },
  showreel: {
    name: 'Highlight Reel',
    zone: 'atk',
    kind: 'play',
    src: 'trait',
    trait: 'showboat',
    needT: 'showboat',
    buff: { jump: 10 },
    when: 'ahead',
    tally: 'attack',
    desc: 'Showboats jump +10 % while ahead'
  },
  ice: {
    name: 'Ice Veins',
    zone: 'atk',
    kind: 'play',
    src: 'trait',
    trait: 'clutch',
    buff: { atk: 6, serve: 6 },
    when: 'late',
    tally: 'attack',
    desc: 'Power and serve +6 % late in the set'
  },
  hot: {
    name: 'Hot Streak',
    zone: 'atk',
    kind: 'play',
    src: 'trait',
    trait: 'hothead',
    buff: { atk: 10 },
    when: 'streak',
    tally: 'attack',
    desc: 'Power +10 % on a 2+ point streak'
  },
  take: {
    name: 'Take the Hit',
    zone: 'def',
    kind: 'play',
    src: 'trait',
    trait: 'iron',
    buff: { def: 8 },
    tally: 'defend',
    desc: 'Defense +8 %'
  },
  wind: {
    name: 'Second Wind',
    zone: 'def',
    kind: 'once',
    src: 'trait',
    trait: 'slow',
    on: 'wind',
    desc: 'One-shot: the court’s HP full, stamina +0.25'
  },
  giant: {
    name: 'Giant Killer',
    zone: 'atk',
    kind: 'play',
    src: 'trait',
    trait: 'underdog',
    buff: { atk: 5, def: 5 },
    when: 'under',
    tally: 'attack',
    desc: 'Power and defense +5 % while the weaker side'
  },
  head: {
    name: 'Get In Their Head',
    zone: 'atk',
    kind: 'play',
    src: 'trait',
    trait: 'trash',
    on: 'taunt',
    tally: 'attack',
    desc: 'Their morale −0.15 when slotted'
  },
  // one-shots and traps (owner, 2026-10-17, T-305)
  talk: {
    name: 'Timeout Talk',
    zone: 'def',
    kind: 'once',
    src: 'book',
    on: 'talk',
    desc: 'One-shot: morale +0.25 on court, Worn marks cleared'
  },
  strap: {
    name: 'Serve Trap',
    zone: 'def',
    kind: 'trap',
    src: 'book',
    trap: ['killer', 'drive', 'target', 'float'],
    desc: 'Hidden: if they slot a serve play, it burns'
  },
  qtrap: {
    name: 'Quick Trap',
    zone: 'def',
    kind: 'trap',
    src: 'book',
    trap: ['quick', 'freak', 'slide'],
    desc: 'Hidden: if they slot a quick play, it burns'
  },
  bait: {
    name: 'Block Bait',
    zone: 'atk',
    kind: 'trap',
    src: 'book',
    trap: ['wall', 'commit', 'readblk', 'rset'],
    desc: 'Hidden: if they slot a block play, it burns'
  },
  // more playbook plays (T-305)
  short: {
    name: 'Short Serve',
    zone: 'atk',
    kind: 'play',
    src: 'book',
    tally: 'serve',
    desc: 'Short serves pull their middles off the net'
  },
  feedhot: {
    name: 'Feed the Hot Hand',
    zone: 'atk',
    kind: 'play',
    src: 'book',
    ord: ['feed', 'hot'],
    who: 'setter',
    tally: 'attack',
    desc: 'The setter feeds the hitter with the highest morale'
  },
  float: {
    name: 'Float Barrage',
    zone: 'atk',
    kind: 'play',
    src: 'book',
    ord: ['srv', 'float'],
    who: 'all',
    grp: 'srv',
    tally: 'serve',
    desc: 'Everyone floats: wobbling serves at a steady passer'
  },
  rset: {
    name: 'Read the Setter',
    zone: 'def',
    kind: 'play',
    src: 'book',
    tally: 'defend',
    desc: 'The block follows their setter’s hands'
  },
  // OP cards (spec §2.37): once a match, from OP players by role (DECK.op) and element players
  god: {
    name: 'God Resolve',
    clean: 30,
    zone: 'op',
    kind: 'op',
    src: 'op',
    role: 'WS',
    buff: { atk: 100, spd: 100, jump: 100 },
    tally: 'attack',
    cost: { who: 'court', bar: 'sta', amt: 0.1 },
    after: { who: 'court', bar: 'mor', amt: 0.3 },
    desc: 'Everyone on court: attack, speed and jump × 2; then everyone’s morale −0.3'
  },
  titan: {
    name: 'Resolve of the Titan',
    clean: 30,
    zone: 'op',
    kind: 'op',
    src: 'op',
    role: 'MB',
    self: 1,
    buff: { def: 100, jump: 100 },
    tally: 'defend',
    cost: { who: 'holder', bar: 'hp', amt: 0.1 },
    after: { who: 'holder', bar: 'sta', amt: 0.4 },
    desc: 'Grows to twice the size: defense and jump × 2; then their stamina −0.4'
  },
  inzone: {
    name: 'INZONE!!',
    clean: 30,
    zone: 'op',
    kind: 'op',
    src: 'op',
    role: 'S',
    on: 'inzone',
    dur: 6,
    tally: 'attack',
    cost: { who: 'holder', bar: 'sta', amt: 0.15 },
    desc: 'The side goes straight into Fever for 6 points; an error or the zone breaker does not end it'
  },
  surge: {
    name: 'Element Surge',
    clean: 30,
    zone: 'op',
    kind: 'op',
    src: 'op',
    on: 'surge',
    tally: 'attack',
    cost: { who: 'holder', bar: 'hp', amt: 0.15 },
    desc: 'Element players on court charged full, every point'
  },
  stand: {
    name: 'Last Stand',
    clean: 20,
    zone: 'def',
    kind: 'play',
    src: 'book',
    buff: { atk: 15, def: 15, jump: 15 },
    when: 'brink',
    tally: 'defend',
    cd: 13,
    cost: { who: 'court', bar: 'sta', amt: 0.03 },
    desc: 'Power, defense and jump +15 % while they are at match point'
  },
  // duo cards (spec §4.36 4, T-330): a friend at bond 60+ (`duo`: your role and theirs, either way); in the pool only while you and
  // that friend are both on court (m.duo, set by the career); the buff reaches only the two of you; never spent
  duo_quick: {
    name: 'Sync Quick',
    zone: 'atk',
    kind: 'play',
    src: 'duo',
    duo: ['S', 'MB'],
    buff: { atk: 8 },
    tally: 'attack',
    desc: 'The two of you: power +8 %'
  },
  duo_pin: {
    name: 'Pin Connection',
    zone: 'atk',
    kind: 'play',
    src: 'duo',
    duo: ['S', 'WS'],
    buff: { atk: 8 },
    tally: 'attack',
    desc: 'The two of you: power +8 %'
  },
  duo_brains: {
    name: 'Two Brains',
    zone: 'def',
    kind: 'play',
    src: 'duo',
    duo: ['S', 'S'],
    buff: { def: 5, spd: 5 },
    tally: 'defend',
    desc: 'The two of you: defense and speed +5 %'
  },
  duo_towers: {
    name: 'Twin Towers',
    zone: 'def',
    kind: 'play',
    src: 'duo',
    duo: ['MB', 'MB'],
    buff: { jump: 8 },
    tally: 'defend',
    desc: 'The two of you: jump +8 %'
  },
  duo_wall: {
    name: 'Double Wall',
    zone: 'def',
    kind: 'play',
    src: 'duo',
    duo: ['MB', 'WS'],
    buff: { jump: 6, def: 4 },
    tally: 'defend',
    desc: 'The two of you: jump +6 %, defense +4 %'
  },
  duo_shield: {
    name: 'Shield Dig',
    zone: 'def',
    kind: 'play',
    src: 'duo',
    duo: ['WS', 'WS'],
    buff: { def: 8 },
    tally: 'defend',
    desc: 'The two of you: defense +8 %'
  }
};
/**
 * The captain's play (spec §2.37, no draws): base score by kind / source; `read` when it fits now; `countered` when it has been
 * countered here `seenCtr`+ times; `key` for a strong card at a key moment. A payer's bar after the cost stays at `floor` or
 * above (else not affordable). It saves OP cards when its read (capIQ) is at `waitOp`+ and strong cards at `wait`+ until a key
 * moment (set point either way, their Fever, `down`+ points down from `late` points on, or their `run`-point streak).
 */
const CARD_AI = {
  basic: 1,
  fuse: 4.5, // a fused card (T-358): one play for two cards
  duo: 3,
  play: 3,
  tech: 3.5,
  trait: 3,
  op: 5,
  trap: 2.5,
  once: 2.5,
  read: 2,
  countered: -5,
  seenCtr: 2,
  key: 3,
  floor: { sta: 0.3, hp: 0.3, mor: -0.35 },
  wait: 0.75,
  waitOp: 0.55,
  down: 3,
  late: 10,
  run: 3
};

/**
 * Reading pays (spec §2.33 balance pass, T-299): each play's situational edge (a technique's edge acts only on its holders —
 * fewer players, so a bigger number — unless `team`: a setter's play or a cut shot lifts the whole side while a holder is on
 * court). fit — the read that makes it fit (CARD_FIT in
 * js/engine/cards.js); ctr — the other side's cards that counter it; e — [who ('us' | 'them'), stat, %]: applied in full
 * when it fits, × −1 when countered (a counter slotted on the other side), × `mis` when neither. Edges stack with the buffs.
 */
const CARD_EDGE = {
  target: {
    fit: 'weakPass',
    ctr: ['cover'],
    e: [
      ['us', 'serve', 30],
      ['them', 'def', -10]
    ]
  },
  killer: {
    fit: 'weakPass',
    ctr: ['cover'],
    e: [
      ['us', 'serve', 20],
      ['them', 'def', -10]
    ]
  },
  drive: {
    fit: 'weakPass',
    ctr: ['cover'],
    e: [
      ['us', 'serve', 20],
      ['them', 'def', -10]
    ]
  },
  power: {
    fit: 'weakBlock',
    ctr: ['deep'],
    e: [
      ['us', 'atk', 20],
      ['them', 'def', -10]
    ]
  },
  beat: {
    fit: 'strongBlock',
    ctr: ['sdig'],
    e: [
      ['us', 'atk', 25],
      ['them', 'jump', -10]
    ]
  },
  cutshot: { fit: 'strongBlock', ctr: ['sdig'], team: 1, e: [['them', 'jump', -25]] },
  delay: { fit: 'strongBlock', ctr: ['sdig'], e: [['us', 'atk', 50]] },
  sync: { fit: 'strongBlock', ctr: ['rset'], team: 1, e: [['us', 'atk', 20]] },
  pipecombo: { fit: 'strongBlock', ctr: ['rset'], team: 1, e: [['us', 'atk', 20]] },
  lefty: {
    fit: 'strongBlock',
    ctr: ['rset'],
    team: 1,
    e: [
      ['us', 'atk', 15],
      ['them', 'jump', -10]
    ]
  },
  tip: { fit: 'tiredFloor', ctr: ['sdig'], e: [['them', 'spd', -25]] },
  quick: { fit: 'lowMiddle', ctr: ['commit', 'readblk', 'short'], e: [['us', 'atk', 25]] },
  freak: { fit: 'lowMiddle', ctr: ['commit', 'readblk', 'short'], e: [['us', 'atk', 50]] },
  slide: { fit: 'lowMiddle', ctr: ['commit', 'readblk', 'short'], e: [['us', 'atk', 50]] },
  wall: {
    fit: 'theirAce',
    ctr: ['beat'],
    e: [
      ['us', 'jump', 30],
      ['them', 'atk', -10]
    ]
  },
  commit: {
    fit: 'theirQuicks',
    ctr: ['power'],
    e: [
      ['us', 'jump', 30],
      ['them', 'atk', -10]
    ]
  },
  readblk: { fit: 'theirQuicks', ctr: ['power'], e: [['us', 'jump', 50]] },
  sdig: {
    fit: 'theirSoft',
    ctr: ['power'],
    e: [
      ['us', 'spd', 25],
      ['us', 'def', 15]
    ]
  },
  deep: { fit: 'theirPower', ctr: ['tip'], e: [['us', 'def', 30]] },
  softblk: { fit: 'theirPower', ctr: ['tip'], e: [['us', 'def', 50]] },
  cover: { fit: 'ourWeakPass', ctr: ['killer', 'drive'], e: [['us', 'def', 20]] },
  spite: { fit: 'behind', ctr: [], e: [['us', 'atk', 15]] },
  hold: { fit: 'behind', ctr: [], e: [['us', 'def', 15]] },
  surge: { fit: 'elements', ctr: [], e: [] },
  // T-304 / T-305
  showreel: { fit: 'ahead', ctr: [], e: [['us', 'atk', 35]] },
  ice: { fit: 'late', ctr: [], e: [['us', 'atk', 15]] },
  hot: { fit: 'streak', ctr: [], e: [['us', 'atk', 30]] },
  take: { fit: 'ourWeakPass', ctr: ['killer', 'drive'], e: [['us', 'def', 25]] },
  wind: { fit: 'tiredUs', ctr: [], e: [] },
  giant: {
    fit: 'under',
    ctr: [],
    e: [
      ['us', 'atk', 15],
      ['us', 'def', 10]
    ]
  },
  head: { fit: 'always', ctr: [], e: [] },
  talk: { fit: 'shaken', ctr: [], e: [] },
  short: {
    fit: 'theirQuicks',
    ctr: ['sdig'],
    e: [
      ['them', 'atk', -30],
      ['us', 'serve', 15]
    ]
  },
  feedhot: { fit: 'hotHand', ctr: ['wall'], team: 1, e: [['us', 'atk', 40]] },
  float: { fit: 'strongPass', ctr: ['cover'], e: [['them', 'def', -30]] },
  rset: {
    fit: 'theirSetter',
    ctr: ['tip'],
    e: [
      ['us', 'jump', 45],
      ['us', 'def', 15]
    ]
  },
  stand: { fit: 'brink', ctr: [], e: [['us', 'def', 15]] },
  god: { fit: 'always', ctr: [], e: [] },
  titan: { fit: 'always', ctr: [], e: [] },
  inzone: { fit: 'cold', ctr: [], e: [] } // (cold: below Focused)
};
/** The edge's factor: fit × 1, countered × `ctr`, misfit × `mis`; all × `k` (the balance knob). */
const EDGE = { ctr: -1.2, mis: -0.6, k: 4.5 };

/**
 * Every card's deck numbers (spec §2.37), unless the card sets its own: `dur` points active (serve cards: your serves, `per`),
 * `cd` points cooling (OP: Infinity — once a match), `cost` on play. Stronger cards cool longer: a technique with a big edge
 * (50 %+) 12, Last Stand DECK.strong (the captain saves it). Fusing: 4 points at least.
 */
(() => {
  // Improve X+ (spec §2.37): the same amplifier twice — stronger, diminishing (each of the two at DECK.amp.plus)
  for (const a of DECK.basics) {
    const c = CARDS[a];
    CARDS[a + 'p'] = {
      name: `${c.name}+`,
      zone: c.zone,
      kind: 'play',
      src: 'fuse',
      parts: [a, a],
      pk: [DECK.amp.plus, DECK.amp.plus],
      desc: `${c.desc} — stronger`
    };
  }
  const big = id => CARD_EDGE[id] && CARD_EDGE[id].e.some(e => Math.abs(e[2]) >= 50);
  const team = ['power', 'tip', 'deep', 'commit', 'sdig', 'float'],
    debuff = ['float', 'short', 'head'];
  for (const [id, c] of Object.entries(CARDS)) {
    if (c.parts) continue; // (fused: below)
    const K =
      c.kind === 'duel'
        ? { dur: 0, cd: 8, cost: { who: 'holder', bar: 'sta', amt: 0.04 } } // (paid by the hesitating player: Cards.duelPlay)
        : c.kind === 'basic'
          ? { dur: 3, cd: 3, cost: { who: 'court', bar: 'hp', amt: 0.02 } }
          : c.kind === 'op'
            ? { dur: 3, cd: Infinity }
            : c.kind === 'trap'
              ? { dur: 6, cd: 8, cost: { who: 'captain', bar: 'mor', amt: 0.05 } }
              : c.kind === 'once'
                ? {
                    dur: 0,
                    cd: 12,
                    cost: c.on === 'wind' ? { who: 'court', bar: 'mor', amt: 0.1 } : { who: 'captain', bar: 'sta', amt: 0.1 }
                  }
                : c.src === 'tech'
                  ? { dur: 4, cd: big(id) ? 12 : 10, cost: { who: 'holder', bar: 'sta', amt: 0.04 } }
                  : c.src === 'trait'
                    ? { dur: 4, cd: 8, cost: { who: 'holder', bar: id === 'take' ? 'hp' : 'sta', amt: 0.03 } }
                    : c.src === 'duo'
                      ? { dur: 4, cd: 6, cost: { who: 'holder', bar: 'sta', amt: 0.03 } }
                      : {
                          dur: 4,
                          cd: 8,
                          cost: team.includes(id) ? { who: 'court', bar: 'sta', amt: 0.01 } : { who: 'captain', bar: 'mor', amt: 0.06 }
                        };
    c.dur ??= K.dur;
    c.cd ??= K.cd;
    c.cost ??= K.cost;
    c.per ??= c.tally === 'serve' && c.kind === 'play' ? 'srv' : 'pts';
    // the card's type (spec §2.37 Card types, T-349): a team play changes how the whole side plays (the captain's; yours only by
    // request), an opponent debuff is aimed at them, the rest (techniques, traits, duos, Basics, Titan) are individual plays
    c.type ??=
      c.kind === 'duel'
        ? 'solo'
        : c.kind === 'trap' || debuff.includes(id)
          ? 'debuff'
          : c.src === 'book' || ['god', 'inzone', 'surge'].includes(id)
            ? 'team'
            : 'solo';
  }
  /** A fused card's deck numbers from its parts (spec §2.37): 3 points (its lead's serves for a serve card), no cost of its own (the parts pay), cools as its slowest part. */
  const fuseDefaults = c => {
    const P = c.parts.map(x => CARDS[x]),
      lead = P.find(x => x.kind !== 'basic') || P[0];
    c.dur ??= Math.max(4, lead.dur || 0);
    c.per ??= lead.per === 'srv' && c.tally === 'serve' ? 'srv' : 'pts';
    c.cd = Math.max(...P.map(x => x.cd));
    c.type ??= P.some(x => x.type === 'team') ? 'team' : P.some(x => x.type === 'debuff') ? 'debuff' : 'solo';
  };
  for (const c of Object.values(CARDS)) if (c.parts) fuseDefaults(c);
})();
