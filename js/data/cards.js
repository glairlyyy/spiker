// Semi-automatic matches (spec §2.31–§2.33): the bars (HP, morale traits), turns and the tactic cards. Data only — the
// engine is js/engine/bars.js and js/engine/cards.js. First numbers, measured (npm run cards), not tuned yet.

/**
 * HP (spec §2.31): every kept-up serve receive / dig takes damage = (impact − gap) / span × the ball's weight (impact = the
 * knockdown's: ball power − Defense as played × KNOCK.defK; weight from KNOCK.from → KNOCK.full). At 0: collapse (the
 * knockdown). After every rally court players heal `heal`, the bench all of it. Low HP drains stamina × 1 + drain × (1 − hp).
 */
const HP = { gap: 0, span: 30, heal: 0.2, drain: 0.5 };

/**
 * Morale traits (spec §2.31), by hash of the player (`share` of all players each; the rest have none). up: their own error /
 * being stuffed (Spiteful); lost: × on a lost point; shake: × on marathons and hard kills; kill: + on their own kill; mates:
 * × on a point a teammate's kill won; lift: the lowest teammate's morale on a lost point (Anchor).
 */
const MTRAITS = {
  spiteful: { name: 'Spiteful', share: 0.12, up: 0.15, lost: 0.5, tip: 'errors and stuffs fire them up' },
  glass: { name: 'Glass', share: 0.1, shake: 2, tip: 'marathons and hard kills shake them twice as hard' },
  showboat: { name: 'Showboat', share: 0.1, kill: 0.15, mates: 0.5, tip: 'lives for their own kills' },
  anchor: { name: 'Anchor', share: 0.1, lost: 0.7, lift: 0.08, tip: 'holds steady and lifts the lowest teammate' },
  stubborn: { name: 'Stubborn', share: 0.08, tip: 'plays their own game: ignores what a card forces' }
};

/** Turns (spec §2.32): every `pts` points played, and at once when a card is spent. Spent tally: Worn at `worn`, Spent at `spent`. */
const TURN = { pts: 6, worn: -2, spent: -3, spentMor: -0.1 };
/** The five slots (spec §2.33): ATK × 2, DEF × 2, FLEX × 1 (any card; the only slot for an OP card). */
const SLOTS = ['atk0', 'atk1', 'def0', 'def1', 'flex'];
const slotZone = k => (k === 'flex' ? 'flex' : k.slice(0, 3));

/**
 * The tactic cards (spec §2.33). zone: 'atk' | 'def' | 'op' (OP: FLEX only). kind: 'boost' (never spent) | 'play'. src:
 * 'base' (always in the pool) | 'coach' (the coach's playbook) | 'tech' (a squad player owns `need`) | 'trait' (a squad player
 * has trait `trait`) | 'op' (an OP or element player in the squad). What a card does, compiled by js/engine/cards.js:
 * buff — stat → % (atk = power in play, def, spd, jump, serve; with `need` only for its holders; `when: 'behind'` only while
 * the side trails); plan — { atk | def } team plan (PLANS); tac — the tactic (TACTICS); ord — [kind, value] role order for
 * its players (`who`: 'holders' | 'mb' | 'hitters'); force — the technique always fires for its holders; on — 'rush' (morale
 * when slotted) | 'surge' (a full element gauge every turn). grp: only one card of a group at a time. tally: the rallies its
 * spent count reads — 'serve' (your serves) | 'recv' (theirs) | 'attack' (rallies you attack in) | 'defend' (they attack in).
 */
const CARDS = {
  // boosts
  pow: { name: 'Power Up', zone: 'atk', kind: 'boost', src: 'base', buff: { atk: 5 }, desc: 'Power +5 %' },
  jmp: { name: 'High Point', zone: 'atk', kind: 'boost', src: 'base', buff: { jump: 5 }, desc: 'Jump +5 %' },
  grd: { name: 'Guard Up', zone: 'def', kind: 'boost', src: 'base', buff: { def: 5 }, desc: 'Defense +5 %' },
  ftw: { name: 'Quick Step', zone: 'def', kind: 'boost', src: 'base', buff: { spd: 5 }, desc: 'Speed +5 %' },
  // the coach's playbook
  hunt: {
    name: 'Hunt the Passer',
    zone: 'atk',
    kind: 'play',
    src: 'coach',
    plan: { atk: 'hunt' },
    grp: 'aplan',
    tally: 'serve',
    desc: 'Every serve at their weakest passer'
  },
  power: {
    name: 'Power Through',
    zone: 'atk',
    kind: 'play',
    src: 'coach',
    plan: { atk: 'power' },
    grp: 'aplan',
    tally: 'attack',
    desc: 'Swing hard, ignore the block'
  },
  beat: {
    name: 'Beat the Block',
    zone: 'atk',
    kind: 'play',
    src: 'coach',
    plan: { atk: 'beat' },
    grp: 'aplan',
    tally: 'attack',
    desc: 'Hit away from their read'
  },
  quick: { name: 'Quick Tempo', zone: 'atk', kind: 'play', src: 'coach', tac: 'mb', tally: 'attack', desc: 'Middles go quick' },
  tip: {
    name: 'Tip & Roll',
    zone: 'atk',
    kind: 'play',
    src: 'coach',
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
    src: 'coach',
    plan: { def: 'wall' },
    grp: 'dplan',
    tally: 'defend',
    desc: 'Block their best hitter'
  },
  cover: {
    name: 'Cover the Weak Link',
    zone: 'def',
    kind: 'play',
    src: 'coach',
    plan: { def: 'cover' },
    grp: 'dplan',
    tally: 'recv',
    desc: 'Protect our weakest passer'
  },
  deep: {
    name: 'Dig Deep',
    zone: 'def',
    kind: 'play',
    src: 'coach',
    plan: { def: 'deep' },
    grp: 'dplan',
    tally: 'defend',
    desc: 'Block the line, floor back'
  },
  commit: {
    name: 'Commit',
    zone: 'def',
    kind: 'play',
    src: 'coach',
    ord: ['blk', 'commit'],
    who: 'mb',
    grp: 'blk',
    tally: 'defend',
    desc: 'Middles jump with their quick'
  },
  sdig: {
    name: 'Speed Dig',
    zone: 'def',
    kind: 'play',
    src: 'coach',
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
    kind: 'play',
    src: 'tech',
    need: 'target',
    ord: ['tgt', 'weak'],
    who: 'holders',
    buff: { serve: 2 },
    tally: 'serve',
    desc: 'Holders serve their weakest passer'
  },
  delay: {
    name: 'Delayed Spike',
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
    zone: 'def',
    kind: 'play',
    src: 'tech',
    need: 'readblk',
    buff: { jump: 6 },
    tally: 'defend',
    desc: 'Holders block +6 %'
  },
  softblk: {
    name: 'Soft Block',
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
  // OP (FLEX only)
  surge: {
    name: 'Element Surge',
    zone: 'op',
    kind: 'play',
    src: 'op',
    on: 'surge',
    tally: 'attack',
    desc: 'Element players start every turn charged'
  },
  rush: { name: 'Fever Rush', zone: 'op', kind: 'play', src: 'op', on: 'rush', tally: 'attack', desc: 'Morale +0.3 on court when slotted' },
  iron: { name: 'Iron Wall', zone: 'op', kind: 'play', src: 'op', buff: { def: 10 }, tally: 'defend', desc: 'Defense +10 %' }
};
/** Combos (spec §2.33): both slotted → the bonus; they share one spent count. `any`: either of the second ids. */
const COMBOS = {
  sniper: { name: 'Sniper', cards: ['killer', 'target'], buff: { serve: 6 } },
  fortress: { name: 'Fortress', cards: ['sdig', 'deep'], buff: { def: 6 } },
  lockdown: { name: 'Lockdown', cards: ['wall', 'commit'], buff: { jump: 6 } },
  decoy: { name: 'Decoy', cards: ['quick', ['freak', 'slide']], buff: { atk: 6 } }
};
/** The coach's pick (no draws): base score of a boost / a play; situational scores; a dull coach (IQ < `dull`) plays only its style's plans. */
const CARD_AI = { boost: 1, play: 0.8, tech: 2.2, trait: 1.8, op: 3.5, style: 1.5, read: 3, combo: 1.2, worn: -2, dull: 0.5 };
