// Encounters on the road, effort and the road's words (spec §4.37 3–4, T-333 / T-335): the numbers, who says what (lore §7 voices),
// and the memory a talk on the road leaves (merged into MEMORY / MEM_TEXT like js/data/team.js). Constants only.

/**
 * The numbers. r: a person counts as on your road within r map units of it; min: a stop never falls within min of either end (the
 * place you leave, the place you arrive at — the greeting there is the floor's). p: the hashed chance a stop happens, by kind. rank:
 * who stops you first when several are near. week: stops a week at most. stops: the setting → the kinds it stops for. alt: the second
 * route — p = the chance the person / the fight it passes stops you, extra / slack = how much longer than the safe road it may be
 * (cost ≤ max(safe × slack, safe + extra)), never a day more. focus: the timing press — k = the day's EXP on top when on the beat,
 * ms = the cut-in's length with the press on, win = the beat (share of ms).
 */
const ENC = {
  r: 70,
  min: 60,
  p: { arc: 0.75, circle: 0.5, battle: 0.6, crew: 0.3 },
  rank: ['arc', 'circle', 'battle', 'crew'],
  week: 3,
  stops: { friends: ['arc', 'circle'], all: ['arc', 'circle', 'battle', 'crew'], never: [] },
  alt: { p: 0.85, slack: 1.5, extra: 220 },
  focus: { k: 0.1, ms: 1800, win: [0.55, 0.8] }
};
/** The setting's names (registrar). */
const ENC_STOPS = { friends: 'Friends', all: 'Everything', never: 'Never' };
/** What someone is doing, by plan act (registrar; "Mint · drilling at the Harbor Gym"). */
const ENC_ACT = {
  train: 'drilling',
  hard: 'training hard',
  wit: 'with the tapes',
  hustle: 'hustling',
  rest: 'resting',
  out: 'out'
};
/** A circle member stopping you, by their headline behaviour (their own words). */
const ENC_HI = {
  warm: ['There you are! Walk with me a bit?', 'Hey! I was hoping I’d run into you.'],
  steady: ['Oh. Hi. I was just… training.', 'You walk this way too? …Okay.'],
  jealous: ['Out for a stroll? Some of us are working.', 'How many reps today? I did more.'],
  cynical: ['You again. Make it quick.', 'Still at it? Hm.'],
  proud: ['Saw my last set? Of course you did.', 'People stop me on the road all the time. You’re welcome.'],
  loyal: ['Good to see a familiar face out here.', 'You look after yours, I look after mine. Hi.'],
  calculating: ['Fancy meeting you. Got a minute — or a favour?', 'Walking’s free. Talking might not be.'],
  reckless: ['Race you to the corner! …No? Fine.', 'Nearly got in a fight back there. Good day so far.'],
  other: ['Hey. You’re out late.', 'Oh — hi.']
};
/** A rival club's crew on the road, in its faction's voice. */
const ENC_CREW = {
  wei: ['The Gazette says you’re nobody. Book a court and prove it.', 'Wei crews don’t scrimmage strays. Unless you insist.'],
  wu: ['Looking at us? Then step on the sand and show some power.', 'No tricks out here. Just bodies. You in?'],
  shu: ['The path is long. You walk it like a tourist.', 'The elders say test yourself. We are the test.'],
  outlaws: ['Bet you can’t take a set off us. The bet’s real.', 'Wei kid? No? Then play.'],
  gloria: ['We could make time for you. Briefly.', 'Our schedule is full. Make it worth our while.']
};
/** The week's street battle on the road (the street). */
const ENC_BATTLE = [
  'It’s kicking off at the border. Both sides want bodies.',
  'Street battle down the road. Pick a colour or keep walking.'
];
/** The second route's names and what it risks (registrar). */
const ENC_ROUTE = {
  safe: { name: 'Safe road', tip: 'The usual road. Nothing on it you didn’t ask for.' },
  battle: { name: 'Short cut · the hot border', tip: 'Same days. Through this week’s street battle: a fight likely.' },
  circle: { name: 'Short cut · past {n}', tip: 'Same days. Past {n}’s place: you’ll likely meet.' }
};

Object.assign(MEMORY, {
  met_road: { v: 2, rep: 0.5 } // you stopped to talk on the road (spec §4.37 3; Friendly × 1.5 by REL.behave)
});
Object.assign(MEM_TEXT, {
  met_road: [
    'Ran into {n} on the road. We talked. Mostly about nothing.',
    '{n} stopped me on the way. The trip felt shorter.',
    'Bumped into {n}. Neither of us pretended it was an accident.'
  ]
});
