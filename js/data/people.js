// NPC careers (spec §4.23 A, H): wants, traits, weekly plans and the numbers behind their activity-based growth.
// Data only; the logic is js/career/people.js. Tables are weights unless noted.

/** What an NPC is after. */
const WANTS = {
  national: { name: 'The national team', desc: 'The national team: plays every match it can, takes risks.' },
  money: { name: 'Money', desc: 'Hustles and takes paid challenges.' },
  spot: { name: 'A starting spot', desc: 'Keeps their starting role; hostile to same-role threats.' },
  grudge: { name: 'A grudge', desc: 'Has a faction to beat: challenges it, joins street battles.' },
  prove: { name: 'To prove them wrong', desc: 'Proves the elders wrong: trains Hard, overtrains.' },
  leave: { name: 'A way out', desc: 'Gets off the island any way possible; disloyal.' }
};
/** Want weights by home (a faction region, or `academy` for the Academy squad). */
const WANT_BY = {
  wei: { national: 3, spot: 3, money: 2, grudge: 1, prove: 0.5, leave: 0.5 },
  wu: { grudge: 3, spot: 2, national: 2, money: 1, prove: 1, leave: 1 },
  shu: { prove: 3, national: 2, spot: 1, grudge: 1, money: 1, leave: 1 },
  outlaws: { money: 3, leave: 2, grudge: 2, prove: 1, spot: 0.5, national: 0.5 },
  gloria: { national: 3, money: 2, spot: 2, leave: 1, prove: 0.5, grudge: 0.5 },
  academy: { national: 3, prove: 2, spot: 2, money: 1, leave: 1, grudge: 0.5 }
};
/** How an NPC behaves. */
const TRAITS = {
  proud: { name: 'Proud', desc: 'Hates being second.' },
  loyal: { name: 'Loyal', desc: 'Sticks with their own.' },
  jealous: { name: 'Jealous', desc: 'Counts what others get.' },
  warm: { name: 'Warm', desc: 'Lets people in.' },
  cynical: { name: 'Cynical', desc: 'Expects the worst, and is rarely wrong.' },
  reckless: { name: 'Reckless', desc: 'Pushes past the warning signs.' },
  calculating: { name: 'Calculating', desc: 'Every move has a reason.' },
  steady: { name: 'Steady', desc: 'Does the work, every day.' }
};
/** Opposite pairs: an NPC never has both of a pair. */
const TRAIT_OPP = [
  ['warm', 'cynical'],
  ['reckless', 'steady'],
  ['loyal', 'calculating']
];
/** Trait weight multipliers by want (others 1). */
const TRAIT_BY_WANT = {
  grudge: { proud: 2, jealous: 2 },
  money: { calculating: 2, cynical: 2 },
  prove: { reckless: 2, proud: 2 },
  national: { steady: 1.5, proud: 1.5 },
  spot: { jealous: 2 },
  leave: { cynical: 2, calculating: 2 }
};
/**
 * Weekly plan weights by want: key = train the key stat, weak = train the lowest stat, hard = key stat on Hard,
 * wit = train wit, rest, hustle = street games for cash (match XP).
 */
const PLAN = {
  national: { key: 3, weak: 2, hard: 1, wit: 1, rest: 1, hustle: 0.3 },
  money: { key: 1, weak: 1, hard: 0.3, wit: 0.3, rest: 1, hustle: 3 },
  spot: { key: 4, weak: 1, hard: 1, wit: 0.5, rest: 1, hustle: 0.3 },
  grudge: { key: 2, weak: 1, hard: 1, wit: 0.3, rest: 0.7, hustle: 2 },
  prove: { key: 2, weak: 1, hard: 3, wit: 0.5, rest: 0.4, hustle: 0.5 },
  leave: { key: 1, weak: 1, hard: 0.5, wit: 0.5, rest: 1.5, hustle: 2 }
};
/** Plan weight multipliers by trait (others 1); both of an NPC's traits apply. */
const PLAN_TRAIT = {
  reckless: { hard: 2, rest: 0.5 },
  steady: { hard: 0.5, rest: 1.3 },
  proud: { key: 1.3 },
  calculating: { weak: 1.3, wit: 1.5 },
  cynical: { rest: 1.3 }
};
/**
 * The numbers. sessions: training sessions a week. xp: base XP per session (× place quality × potential × Hard league ×
 * `hard` on a Hard session), through the same curve as yours (Training.need). sta: stamina costs / gains (0–100).
 * hurt: chance a Hard session injures (`low` when stamina < lowSta), injury length in weeks. hustle: match XP (key stat 0.4, the others 0.2 each)
 * from a week of street games. play: weekly match XP (key stat 0.4, the others 0.2 each) for a league-team starter (they play off screen).
 */
const PEOPLE = {
  sessions: 4,
  xp: 20,
  hard: 1.6,
  sta: { train: 15, hard: 25, hustle: 10, rest: 60, week: 20, tired: 35 },
  hurt: { hard: 0.04, low: 0.12, lowSta: 40, weeks: [1, 3] },
  hustle: 100,
  play: 100
};
/**
 * What an NPC remembers about you (spec §4.23 B). kind → { v: base value, rep: ×rep per same-kind repeat in one week,
 * flip: traits that turn it negative, scar: never fades, payoff: a "useful to me" kind (calculating) }.
 * `event` takes its value from the event. More kinds come with their sources (T-063, T-064).
 */
const MEMORY = {
  trained: { v: 3, rep: 0.5 },
  hung_out: { v: 4, rep: 0.5 },
  won_together: { v: 5, payoff: 1 },
  lost_together: { v: 2, flip: ['jealous', 'cynical'] },
  event: { v: 0 },
  spot_taken: { v: -30, scar: 1 },
  beat_me: { v: -8 },
  stole_my_ball: { v: -6 },
  collided: { v: -4 },
  hero_carried: { v: 8, payoff: 1, flip: ['jealous'] },
  set_hogged: { v: -4 },
  invited: { v: 6 },
  refused_help: { v: -6 },
  ignored: { v: -2 },
  spot_given: { v: 20, payoff: 1 },
  sat_for_you: { v: -10 },
  duo: { v: 6 },
  lent_money: { v: 10, payoff: 1 },
  debt_unpaid: { v: -4 },
  ducked: { v: -5 },
  called_out: { v: -5 },
  vouched: { v: 15, payoff: 1 },
  warned: { v: 4 },
  advised: { v: 10, payoff: 1 },
  held_back: { v: -8 },
  sided_with: { v: 8, payoff: 1 },
  sided_against: { v: -8 }
};
/**
 * The relationship numbers. decay: stance fades per week (scars never). max: entries kept per pair. tags: stance
 * thresholds. rivalOvr: same role and OVR within this = a rival. bondK: stance → the cached 0–100 `you.bond`.
 * trait: multipliers by trait (pos / neg = the value's sign; scar / a kind name; payoff / other for calculating).
 */
const REL = {
  decay: 0.93,
  max: 24,
  tags: { ally: 40, respect: 15, resent: -15, enemy: -45 },
  rivalOvr: 5,
  bondK: 8,
  know: { want: 6, trait: [4, 9] }, // memories with you before their want / first trait / second trait show on their card
  // approaches (T-063): max a week, base chance (x the kind's weight by want), the loan range, the chance a loan is repaid by trait,
  // the OVR / key-stat bar a vouch cuts, what refusing a call-out costs, the trait mods on your own asks
  // fates (T-064): cut after `cut` evaluations on the bench (and under the faction's join OVR); a cut player may quit after `weeks`
  // in the reserves (chance p); the `top` share of a faction by OVR with want money / leave may be poached (p a payday);
  // `national`: how many of the U21 champions' NPCs are called up
  // squad chemistry (T-065): `result` damps the off-screen result memories between squadmates; `capVouch` is the lineup score a captain's
  // ally gains (and a captain's enemy loses); `pairs` is the budget of NPC ↔ NPC memories in the whole run (the oldest non-scar go first)
  chem: { result: 0.5, capVouch: 2, pairs: 1500, win: 50 },
  fate: { cut: 3, quit: { weeks: 6, p: 0.35 }, poach: { top: 0.2, p: 0.25 }, national: 4 },
  ask: {
    max: 2,
    base: 0.35,
    borrow: [60, 160],
    repay: { calculating: 0.9, steady: 0.9, loyal: 0.85, reckless: 0.4, cynical: 0.5, other: 0.7 },
    vouch: 5,
    callout: { fans: 300, rep: 5 },
    mine: { warm: 0.15, proud: -0.1, cynical: -0.1 }
  },
  trait: {
    proud: { scar: 2, beat_me: 2, refused_help: 2 },
    loyal: { neg: 0.6 },
    jealous: { spot_taken: 1.5 },
    warm: { pos: 1.3 },
    cynical: { pos: 0.7 },
    calculating: { payoff: 1.5, other: 0.5 }
  }
};
/**
 * Diary lines for a memory (voice `diary`: the MC, first person, spite and sarcasm, sometimes wrong). {n} = their first name
 * (no pronouns for them). A line is picked by a hash of (kind, week, id). MEM_ALT: trait-specific lines (win over MEM_TEXT).
 */
const MEM_TEXT = {
  trained: ["Trained next to {n}. Didn't hate it.", 'Shared a floor with {n} again. We lived.', '{n} counted my reps. I counted theirs.'],
  hung_out: [
    'Ramen with {n}. {n} paid. Suspicious.',
    'Spent a day with {n} doing nothing. It was fine.',
    '{n} and a long afternoon. Nobody died.'
  ],
  won_together: [
    'We won. {n} was there for it.',
    'Won with {n} on court. Put it on the wall.',
    "{n} and me, one win. Don't get used to it."
  ],
  lost_together: [
    'Lost with {n}. Nobody talked on the way back.',
    'We lost. {n} looked at the floor. So did I.',
    "A loss with {n}. We'll pretend it was the ref."
  ],
  event: ['{n} and me — you had to be there.', 'Something happened with {n}. It counts.', "{n} was part of it. That's all I'll say."],
  spot_taken: [
    "I took {n}'s spot. {n} hasn't forgotten.",
    '{n} watched from the bench. I felt it from the court.',
    "Started over {n}. The coach didn't blink. {n} did."
  ],
  beat_me: ['I beat {n}. {n} took it personally.', "{n} lost to me. I'll hear about it.", 'Won against {n}. Not sorry.'],
  stole_my_ball: [
    'Took a ball off {n}. Mine anyway.',
    "{n} called it. I took it. We'll see who's right.",
    "Grabbed {n}'s ball. Instinct. Mostly."
  ],
  collided: [
    'Ran straight into {n}. Again.',
    '{n} and I met in mid-air. Nobody won.',
    'Crashed into {n}. We both said sorry. Neither meant it.'
  ],
  hero_carried: [
    'Carried the point. {n} noticed.',
    'Swung when it was ugly. {n} saw it land.',
    'Took the bad set and made it good. {n} noticed.'
  ],
  set_hogged: ['Called for the set over {n}. Worth it.', "Took the set from {n}. They'll live.", '{n} wanted it. I called it first.'],
  invited: [
    '{n} asked me to train. I went. Said nothing about it.',
    "A day at {n}'s place of choice. Fine. Better than fine, don't tell anyone."
  ],
  refused_help: ["Told {n} no. {n} won't forget the tone.", '{n} asked. I said no. It was a good no.'],
  ignored: ['{n} wanted something. I let it lapse. They noticed.', 'Never answered {n}. Not rude, just busy.'],
  spot_given: ['{n} gets my seat this week. Nobody had to beg. Almost.', 'Sat out for {n}. They owe me. They know.'],
  sat_for_you: ['{n} sat out so I could play. I should say thanks. Later.', 'Took the court. {n} took the bench. Both knew why.'],
  duo: ["Fought next to {n}. We argued about it after. That's a duo.", '{n} and me against a club. Stupid. Fun.'],
  lent_money: ['{n} paid me back. On time. Suspicious.', 'Got the money back from {n}. Faith, partly restored.'],
  debt_unpaid: ['{n} still owes me. They know I know.', 'Still no money from {n}. Counting.'],
  ducked: ['{n} called me out and I stayed home. Smart. Probably.', 'Dodged {n}. It felt practical.'],
  called_out: ["Called {n} out. {n} didn't laugh.", '{n} got challenged by me. In public. Deserved it.'],
  vouched: ['{n} put in a word for me. Nobody does that for free.', '{n} vouched for me. I owe a dinner and a lie.'],
  warned: ['{n} told me something useful. Out of spite, probably.', 'A warning from {n}. Noted. Mostly.'],
  advised: [
    '{n} asked what to do. I said go. They went. Responsibility, apparently.',
    'Told {n} the truth about leaving. Not my fault how it ends.'
  ],
  sided_with: ['{n} saw me take their side. That is not forgotten.', 'Stood with {n} when it counted. They keep count.'],
  sided_against: ['Sided against {n}. They know.', '{n} lost the argument, and noticed who made sure of it.'],
  held_back: ["Talked {n} out of leaving. {n} hasn't thanked me.", '{n} stayed because I said so. They will remember who to blame.']
};
const MEM_ALT = {
  hero_carried: { jealous: ['Carried the point. {n} hated that.', "Swung and it landed. {n}'s face said everything."] }
};
/** Their season in one line (voice `rumor`: "word is", unreliable by definition — but the numbers are true). Chosen by the largest log count. */
const SEASON_TEXT = {
  hard: [
    'Word is {n} trained Hard {hard} weeks and got hurt {hurt}×.',
    'Word is {n} pushes past the limit: {hard} Hard weeks, hurt {hurt}×.'
  ],
  train: ['Word is {n} put in {train} weeks on the training floor.', 'Word is {n} trains while others talk — {train} weeks so far.'],
  hustle: [
    'Word is {n} hustles more than trains: {hustle} weeks of street games.',
    'Word is {n} lives on the street courts — {hustle} weeks and counting.'
  ],
  rest: ['Word is {n} has rested {rest} weeks. Pacing, or hiding.', 'Word is {n} took {rest} weeks off. Make of it what you will.'],
  none: ["Word is nobody's seen {n} do much yet."]
};
/**
 * What an NPC asks of you (T-063). kind -> { w: weight by want, text: their line in the voice of their home (Academy: registrar-dry),
 * a / b: your two answers }. The rules for who may ask are in js/career/asks.js (Asks.need).
 */
const APPROACH = {
  invite_train: {
    w: { national: 1, prove: 1, spot: 0.5, grudge: 0.5, money: 0.25, leave: 0.25 },
    text: {
      wei: 'Train with me. The facility is booked. Do not be late.',
      wu: 'Floor is open. Come sweat with me, no tricks.',
      shu: 'The old ground is quiet today. Walk it with me.',
      outlaws: "Court is free and nobody's looking. You in?",
      gloria: 'A session together would be mutually beneficial. Shall we?',
      academy: 'Training slot available. Participation is optional.'
    },
    a: 'Train together',
    b: 'Not today'
  },
  ask_sitout: {
    w: { spot: 3, national: 2, prove: 1, grudge: 0.5, money: 0.5, leave: 0.3 },
    text: {
      wei: 'Give me this match. You will have the next one. Probably.',
      wu: 'You get every one. Let me have this one. Please.',
      shu: 'Some places are earned in patience. Yield this one.',
      outlaws: "Sit this one out, would you? I'll make it worth it.",
      gloria: 'Stepping aside this week would be noted, favourably.',
      academy: 'Request: withdraw from this selection. Reason not required.'
    },
    a: 'Sit out',
    b: 'No'
  },
  duo_challenge: {
    w: { grudge: 2, money: 2 },
    text: {
      wei: 'There is a club I need to answer. Stand with me for it.',
      wu: "I'm going at them. Two of us is a message.",
      shu: 'A debt that old needs two hands. Stand beside me.',
      outlaws: "I'm picking a fight. Come make it a good one.",
      gloria: 'A joint appearance against a club. The upside is shared.',
      academy: 'Proposed: joint challenge. Stakes divided equally.'
    },
    a: 'Fight beside them',
    b: 'Not me'
  },
  borrow: {
    w: { money: 3, leave: 2 },
    text: {
      wei: 'A small loan, discreetly. I will be good for it.',
      wu: "I'm short. I'll pay it back in sweat.",
      shu: 'Lend me this. The ground remembers who helped.',
      outlaws: 'Lend me some. Back on payday. Probably.',
      gloria: 'A short-term advance. Terms can be discussed.',
      academy: 'Request: temporary loan. Repayment at next stipend.'
    },
    a: 'Lend it',
    b: 'No'
  },
  call_out: {
    w: { grudge: 3, spot: 2, prove: 2, national: 1, money: 1, leave: 0.5 },
    text: {
      wei: 'My club against yours, if you can find the nerve.',
      wu: 'You and me. My crew, your pride. Show up.',
      shu: 'Stand where I stand. We will see what you are.',
      outlaws: 'Come find us. Bring a reason.',
      gloria: 'A formal challenge is on offer. Decline at your peril.',
      academy: 'Challenge notice issued. Response expected.'
    },
    a: 'Take it',
    b: 'Duck it'
  },
  vouch: {
    w: { national: 1, spot: 1, prove: 1, grudge: 1, money: 1, leave: 1 },
    text: {
      wei: 'I can say a word for you at my club. Count it as owed.',
      wu: "My crew would take you if I say so. I'll say so.",
      shu: 'I will speak for you where it matters.',
      outlaws: "I know the people there. I'll put in a good word.",
      gloria: 'A reference can be arranged. Consider it a courtesy.',
      academy: 'A recommendation letter may be issued on request.'
    },
    a: 'Accept',
    b: 'Not needed'
  },
  warn: {
    w: { national: 1, spot: 1, prove: 1, grudge: 1, money: 1, leave: 1 },
    text: {
      wei: 'A word, before the rest hear it.',
      wu: "Listen. Don't say where you heard it.",
      shu: 'The old paths whisper. Hear this.',
      outlaws: "Between us, yeah? Here's what's going round.",
      gloria: 'A courtesy, for the record.',
      academy: 'Notice. For your information only.'
    },
    a: 'Noted',
    b: 'Noted'
  }
};
APPROACH.poach_advice = {
  w: {}, // (never rolled: People.poach creates it)
  text: {
    wei: 'An offer came. Tell me honestly: should I go?',
    wu: 'Somebody wants me away from here. Do I go?',
    shu: 'The road is open to me. Should I walk it?',
    outlaws: 'Got an offer. Should I take it and run?',
    gloria: 'A better contract has been tabled. Your advice?',
    academy: 'Notice: transfer offer received. Advice requested.'
  },
  a: 'Go',
  b: 'Stay'
};
/** Gazette rumours (voice `rumor`) when a clique forms or a feud starts in a squad you have met. {t} = the club, {a} {b} {c} = first names. */
const CHEM_TEXT = {
  clique: [
    'Word is {a}, {b} and {c} at {t} have become thick as thieves.',
    'Word is {t} has a clique now: {a}, {b} and {c} do not split up.'
  ],
  feud: ['Word is {a} and {b} at {t} have stopped speaking.', 'Word is {a} and {b} will not pass to each other at {t}.']
};
APPROACH.take_side = {
  w: { grudge: 2, spot: 2, prove: 1, national: 1, money: 0.5, leave: 0.5 },
  text: {
    wei: 'It is between me and {o}. You will have to be seen on a side.',
    wu: 'Me and {o} are done talking. Whose side are you on?',
    shu: 'Two people, one ground. Stand with one of us.',
    outlaws: "{o} and me, it's gone sour. You're with me or you're not.",
    gloria: 'A dispute with {o}. A public position would be valued.',
    academy: 'Dispute notice: {o}. Please indicate a preference.'
  },
  a: 'Side with them',
  b: 'Side with the other'
};
