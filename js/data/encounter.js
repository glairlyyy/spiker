// Encounters on the road, effort and the road's words (spec §4.37 3–4, T-333 / T-335): the numbers, who says what (lore §7 voices),
// and the memory a talk on the road leaves (merged into MEMORY / MEM_TEXT like js/data/team.js). Constants only.

/**
 * The numbers. r: a person counts as on your road within r map units of it; min: a stop never falls within min of either end (the
 * place you leave, the place you arrive at — the greeting there is the floor's). p: the hashed chance a stop happens, by kind. rank:
 * who stops you first when several are near. week: stops a week at most. stops: the setting → the kinds it stops for. alt: the second
 * route — p = the chance the person / the fight it passes stops you, extra / slack = how much longer than the safe road it may be
 * (cost ≤ max(safe × slack, safe + extra)), never a day more.
 */
const ENC = {
  r: 70,
  min: 60,
  p: { arc: 0.75, circle: 0.5, battle: 0.6, crew: 0.3 },
  rank: ['arc', 'circle', 'battle', 'crew'],
  week: 3,
  stops: { friends: ['arc', 'circle'], all: ['arc', 'circle', 'battle', 'crew'], never: [] },
  alt: { p: 0.85, slack: 1.5, extra: 220 },
  // the figure menu (spec §4.37 7, T-340). invite: who says yes — bond at least `bond`, then their headline behaviour's chance p
  // (+ perBond for every bond point over `bond`, at most max; by hash), likely from `likely`, doubtful from `doubt`. spar: a court
  // (an explored court or a venue) within r of them; the match XP × xp of a real match, − sta stamina, the memory either way.
  invite: {
    bond: 20,
    p: { warm: 0.9, loyal: 0.85, steady: 0.7, reckless: 0.75, calculating: 0.6, proud: 0.5, jealous: 0.4, cynical: 0.35, other: 0.6 },
    perBond: 0.004,
    max: 0.95,
    likely: 0.7,
    doubt: 0.45
  },
  spar: { r: 90, xp: 0.5, sta: 12 },
  // the Ref drone (spec §4.38, T-339): a pickup's opponents stand within r of the point (one crew each, nearest first); a spar with the
  // drone plays on the first open ground at `near` (map units) round them, `dirs` ways. Who plays off a flat floor: headline behaviours
  // in `flat` refuse every ground but those in `ok`; everyone else plays (a loss there leaves no bad memory — owner, 2026-10-21). Asphalt: each
  // knockdown of yours risks an injury of `injWeeks` (GROUNDS.asphalt.ko) and, under Endurance `soft`, `pain` Pain (at most painMax).
  pickup: {
    r: 150,
    near: [0, 30, 60, 90],
    dirs: 8,
    flat: ['cynical', 'proud'],
    ok: ['asphalt'],
    injWeeks: 1,
    soft: 50,
    pain: 4,
    painMax: 8
  }
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
  battle: { name: 'Short cut · the hot border', tip: 'An hour more at most. Through this week’s street battle: a fight likely.' },
  circle: { name: 'Short cut · past {n}', tip: 'An hour more at most. Past {n}’s place: you’ll likely meet.' }
};

/** The figure menu's rows (registrar): name and what it gives — the control reads "cost → result". */
const ENC_MENU = {
  talk: { name: 'Talk', res: 'a small memory' },
  invite: { name: 'Invite', res: 'joins your next order' },
  spar: { name: 'Spar', res: 'a practice match · no stake' },
  challenge: { name: 'Challenge', res: 'a match' },
  card: { name: 'Card', res: 'their People card' },
  pickup: { name: 'Pickup', res: 'a street match · no stake' },
  here: { name: 'Challenge here', res: 'a match on the spot' },
  rent: { name: 'Rent the drone', res: 'one pickup game' },
  buy: { name: 'Buy the drone', res: 'pickup games anywhere' }
};
/** Asked to play off a flat floor and saying no, by headline behaviour (their own words; only Picky / Egoist refuse). */
const ENC_GROUND = {
  no: {
    cynical: ['On that? I play on a floor. A real one.', 'Find a court. Then ask me again.'],
    proud: ['My knees are worth more than your field.', 'I don’t play in the dirt. Ever.'],
    other: ['Not here.', 'Not on that.']
  }
};
/** Asked to train with you, by their headline behaviour (their own words): yes / no. */
const ENC_INVITE = {
  yes: {
    warm: ['Yes! Finally. Lead the way.', 'Together? Obviously.'],
    steady: ['…Okay. I’ll come.', 'Sure. If you want.'],
    jealous: ['Fine. Try to keep up.', 'Only so I can watch your form.'],
    cynical: ['One session. Don’t make it weird.', 'Fine. You’re paying attention, at least.'],
    proud: ['You want to learn from me. Understandable.', 'I’ll show you how it’s done.'],
    loyal: ['For you? Sure.', 'Count me in.'],
    calculating: ['Deal. You owe me one.', 'Sure — it’s good for both of us.'],
    reckless: ['Let’s go hard. Now.', 'Yes. Last one there does extra reps.'],
    other: ['Sure.', 'Why not.']
  },
  no: {
    warm: ['Not today — I promised someone. Soon?', 'Ah, I can’t. Ask me again?'],
    steady: ['I… have my own plan today.', 'Maybe another day.'],
    jealous: ['And help you get better than me? No.', 'Train with yourself.'],
    cynical: ['No.', 'I train alone.'],
    proud: ['You’re not at my level yet.', 'I don’t train with just anyone.'],
    loyal: ['My crew comes first today.', 'Not today. My people need me.'],
    calculating: ['What’s in it for me? Nothing. So no.', 'Not worth my day.'],
    reckless: ['Boring. Pass.', 'Train? I’ve got better plans.'],
    other: ['Not today.', 'No, thanks.']
  }
};

Object.assign(MEMORY, {
  met_road: { v: 2, rep: 0.5 }, // you stopped to talk on the road (spec §4.37 3; Friendly × 1.5 by REL.behave)
  sparred: { v: 3, rep: 0.5 } // a practice match against their crew, win or lose (spec §4.37 7)
});
Object.assign(MEM_TEXT, {
  met_road: [
    'Ran into {n} on the road. We talked. Mostly about nothing.',
    '{n} stopped me on the way. The trip felt shorter.',
    'Bumped into {n}. Neither of us pretended it was an accident.'
  ],
  sparred: [
    'Sparred {n}’s crew. Nobody kept score. Everybody kept score.',
    'A practice game with {n}’s lot. We shook hands after. Mostly.',
    '{n} came at me hard in the spar. Good.'
  ]
});
