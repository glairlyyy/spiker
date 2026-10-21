// Team life (spec §4.36 2–4): the team chat after your matches, personal arcs, duo cards and ex-teammates. Data only — the logic is
// js/career/team.js (Team); the duo cards themselves are CARDS entries (js/data/cards.js, src 'duo'). Its memory kinds are merged into
// MEMORY / MEM_TEXT below (people.js stays as it is).

/**
 * The numbers. chat: messages after a match (min–max, by hash). circle: the most people Team reads from the circle. duo: the bond that
 * unlocks a friend's duo card. grow: an NPC's growth × this for the rest of the season once their arc is helped through. lean: the
 * chance (hash) a helped friend is drawn into your year-2 Cup squad, if within `leanOvr` OVR of the player they replace.
 * arc: start (first / last week a season an arc may begin), gap (weeks between a helped beat and the next), open (weeks a beat waits
 * after the week it opens), wait (weeks a "match beside them" promise holds), sitWait (weeks the seat beat waits for a match week
 * before it becomes a choice), max (arcs running at once).
 */
const TEAM = {
  chat: { min: 2, max: 4 },
  circle: 5,
  duo: 60,
  grow: 1.1,
  lean: 0.6,
  leanOvr: 5,
  arc: { start: [2, 16], last: 21, gap: 2, open: 1, wait: 2, sitWait: 4, max: 2 }
};

/**
 * The team chat (spec §4.36 2): behaviour (the first trait, TRAITS key) → the situation → lines, said by that teammate in their
 * behaviour's voice (the Hothead blames, the Friendly cheers, the Egoist talks about themselves). Situations: win / loss, `_you` = your
 * match line beat theirs by REL.behave.proud.gap, `_them` = theirs beat yours. {you} = your first name. Picked by hash.
 */
const TEAM_CHAT = {
  warm: {
    win_you: ['{you}!! That was all you. Dinner is on me.', 'Did everyone see {you} today? I did. I am still yelling.'],
    win_them: ['We did it! I had a good one, didn’t I? Didn’t I?', 'That felt amazing. Same again next time, everyone!'],
    win: ['We won!! Group photo, nobody leaves.', 'Good game, all of you. I mean it.'],
    loss_you: ['Rough one, {you}. Happens. We go again.', 'Hey. Don’t sit alone with it, {you}. Food?'],
    loss_them: ['That one is on me. Sorry, everyone. I’ll fix it.', 'I let you down today. Not happening twice.'],
    loss: ['We lost, but we were close. Closer than last time.', 'Chin up. Snacks after, my treat.']
  },
  steady: {
    win_you: ['…good game, {you}.', 'You were good today. That’s all.'],
    win_them: ['…I think I played okay.', 'That went well. I’ll keep working.'],
    win: ['We won. Good.', '…nice.'],
    loss_you: ['…it’s fine, {you}.', 'Next time. Okay?'],
    loss_them: ['…sorry. My fault.', 'I’ll train more.'],
    loss: ['…', 'We’ll get them next time. I think.']
  },
  jealous: {
    win_you: ['Fine, you had the better game. Next week it’s mine.', 'Enjoy it, {you}. I am counting your kills. And mine.'],
    win_them: ['Count them, {you}. More than you. Just saying.', 'Who had the most points? Me. Good. Moving on.'],
    win: ['We won. Now who trains Hard tomorrow? Me first.', 'A win. Not enough. Again.'],
    loss_you: ['You had an off day. I didn’t. Remember that.', 'Lost, and you were the gap, {you}. Train Hard with me, then.'],
    loss_them: ['I’ll beat my own line next time. Watch.', 'Bad game for me. It won’t stand.'],
    loss: ['Lost. I hate this. Hard session tomorrow. Who’s in?', 'They were better today. Today.']
  },
  cynical: {
    win_you: ['Not bad, {you}. Don’t make a habit of being lucky.', 'You were decent. I’ll believe it twice.'],
    win_them: ['I carried the middle stretch. Nobody noticed. Typical.', 'We won because I stopped trusting the setter.'],
    win: ['A win against that lot proves nothing.', 'We won. The other side forgot how to pass.'],
    loss_you: ['That was your game to lose, {you}. You lost it.', 'I expected it. Still disappointing.'],
    loss_them: ['Yes, I was bad. Say it before I do.', 'Off day. Don’t make it a story.'],
    loss: ['Predictable.', 'We lost. Shocking to nobody.']
  },
  proud: {
    win_you: ['You got lucky with the sets I made happen.', 'Good. Next time leave the big ones to me.'],
    win_them: ['Did you see my third kill? I am watching it tonight.', 'Me. That was me. You’re welcome, all of you.'],
    win: ['Another win with my name on it.', 'I made that look easy. Because it was.'],
    loss_you: ['Next time give me the ball, {you}.', 'I was ready. You weren’t.'],
    loss_them: ['My worst game in weeks and we still almost had it. Think about that.', 'Not my day. Don’t get used to it.'],
    loss: ['If they had fed me more, we would be celebrating.', 'I did my part.']
  },
  loyal: {
    win_you: ['Good game for us, {you}. You’re one of us now.', 'That’s how we play. Together.'],
    win_them: ['For the club. Always for the club.', 'I gave it everything for the shirt.'],
    win: ['Another one for the club.', 'We stick together, we win. Simple.'],
    loss_you: ['We lose together, {you}. Nobody blames anybody.', 'Rough game. We cover each other. That’s the deal.'],
    loss_them: ['I let the shirt down. Won’t happen again.', 'That one is on me. Not on the club.'],
    loss: ['We lost as a team. We come back as one.', 'Heads up. The club is still the club.']
  },
  calculating: {
    win_you: ['That’s a win bonus, {you}. Your line paid it.', 'Good numbers today. Good for my price.'],
    win_them: ['My line just went up. So did my fee.', 'That’s the tape I show my agent.'],
    win: ['Win bonus. Lovely.', 'A win is a win. Payday is nicer for it.'],
    loss_you: ['That loss cost all of us money, {you}.', 'No bonus. I noted who missed what.'],
    loss_them: ['Bad tape for me. Delete it.', 'I’ll make it back. I always do.'],
    loss: ['No bonus this week. Wonderful.', 'Losing is expensive.']
  },
  reckless: {
    win_you: ['YES. {you}, again, like that, every time!!', 'That’s it! Who’s next? Bring them!'],
    win_them: ['Did you SEE that spike? Nobody touches me!', 'I was on fire today! Fire!'],
    win: ['We crushed them!! Celebrate, now!', 'WIN! Loud, everyone, loud!'],
    loss_you: ['That was on you, {you}. All of it.', 'You froze, {you}. I saw it. Everyone saw it.'],
    loss_them: ['The ref robbed me. Twice.', 'I’ll make them pay. Next time.'],
    loss: ['That ref. That floor. That whole place.', 'Who lost us that set? Someone did.']
  }
};
/**
 * Your one reply to the chat (spec §4.36 2): a memory with each teammate who wrote, `v` × their behaviour (`by`, others × 1; 0 = no
 * memory). `log`: your diary line (voice `diary`). key: its hotkey.
 */
const TEAM_REPLY = {
  back: {
    name: 'Back them',
    key: '1',
    mem: 'chat_back',
    v: 3,
    by: { proud: 1.5, reckless: 1.5, loyal: 1.3, cynical: 0.5 },
    log: 'Backed the team in the chat. Somebody had to.'
  },
  joke: {
    name: 'Joke',
    key: '2',
    mem: 'chat_joke',
    v: 2,
    by: { warm: 1.5, reckless: 1.2, steady: 0.5, cynical: -1, proud: -1 },
    log: 'Made a joke in the team chat. Not everyone laughed.'
  },
  quiet: {
    name: 'Stay quiet',
    key: '3',
    mem: 'chat_quiet',
    v: 1,
    by: { steady: 1.5, cynical: 1, calculating: 1, warm: -1, reckless: -1, jealous: 0, proud: 0, loyal: 0 },
    log: 'Read the team chat. Said nothing. It was a choice.'
  }
};

Object.assign(MEMORY, {
  chat_back: { v: 3, rep: 0.5 }, // you backed them in the team chat (spec §4.36 2)
  chat_joke: { v: 2, rep: 0.5 },
  chat_quiet: { v: 1, rep: 0.5 }
});
Object.assign(MEM_TEXT, {
  chat_back: ['Backed {n} in the team chat. {n} noticed.', 'Took {n}’s side after the match. Cheap, but it counts.'],
  chat_joke: ['Joked with {n} after the match. {n} took it how {n} takes things.', 'Made {n} laugh after a match. Or wince.'],
  chat_quiet: ['Said nothing to {n} after the match. {n} read it somehow.', 'Left {n} on read. On purpose.']
});

/**
 * Personal arcs (spec §4.36 3): one per circle member a season, built on their want — three beats, each asking you for something.
 * name: the arc (registrar-dry); beats: { name, ask, line (theirs), a (help) / b (refuse) — your answers, yes / no (your diary lines,
 * {n} = their first name) }. ask: 'day' (a training day together at their place) · 'money' (`amt`) · 'match' (your next match beside
 * them, within TEAM.arc.wait weeks) · 'sit' (you sit out this evaluation; waits for a match week) · 'choice'. `alt`: the beat when it
 * can't be played as written (a match with someone off your squad, the seat when no match week comes) — its fields override.
 * `soft`: refusing writes no memory; `back`: refusing pays you this back.
 */
const ARCS = {
  national: {
    name: 'The call-up',
    beats: [
      {
        name: 'The rumour',
        ask: 'day',
        line: 'Word is a national scout is on the island. Train with me before they look.',
        a: 'Train together',
        b: 'Not now',
        yes: 'Trained with {n} for the scout. If there is a scout.',
        no: 'Told {n} the scout can wait. {n} did not like that.'
      },
      {
        name: 'The test match',
        ask: 'match',
        line: 'A test match. I need someone beside me who makes me look ready.',
        a: 'I’ll be there',
        b: 'Find someone else',
        yes: 'Played beside {n} with the scout watching. Probably watching.',
        no: '{n} played the test without me.',
        alt: { ask: 'day', line: 'They want tape of me. Run drills with me so it looks like I belong.', a: 'Run drills' }
      },
      {
        name: 'The verdict',
        ask: 'choice',
        line: 'They said “maybe”. Tell me it is not a no.',
        a: 'It’s a yes in disguise',
        b: 'Maybe it is a no',
        yes: 'Told {n} “maybe” means yes. I might be lying.',
        no: 'Told {n} the truth. {n} did not want it.'
      }
    ]
  },
  money: {
    name: 'The debt',
    beats: [
      {
        name: 'The creditors',
        ask: 'money',
        amt: 80,
        line: 'I owe the wrong people. Eighty would make it go away.',
        a: 'Pay it',
        b: 'Not a bank',
        yes: 'Paid {n}’s debt. Lighter wallet, one friend heavier.',
        no: 'Said no to {n}’s debt. Not a bank.'
      },
      {
        name: 'The hustle',
        ask: 'match',
        line: 'There is cash on the next game. Play it beside me.',
        a: 'Count me in',
        b: 'Not this one',
        yes: 'Played beside {n} for the money. {n} counted it twice.',
        no: '{n} hustled without me.',
        alt: { ask: 'day', line: 'A street crew wants to see me sharp. Train with me today.', a: 'Train together' }
      },
      {
        name: 'The payoff',
        ask: 'choice',
        line: 'It paid. Here is your eighty back — unless you let me keep it.',
        a: 'Keep it',
        b: 'Take the $80',
        soft: 1,
        back: 80,
        yes: 'Let {n} keep the money. Generous. Suspiciously.',
        no: 'Took my $80 back from {n}. Fair is fair.'
      }
    ]
  },
  spot: {
    name: 'The seat',
    beats: [
      {
        name: 'Losing it',
        ask: 'day',
        line: 'The coach is looking past me. Stay after with me and run my drills.',
        a: 'Stay after',
        b: 'Not today',
        yes: 'Ran {n}’s drills after hours. My legs filed a complaint.',
        no: 'Left {n} on the floor alone.'
      },
      {
        name: 'Sit out',
        ask: 'sit',
        line: 'Sit out this evaluation. Let me show them I still belong.',
        a: 'Sit out',
        b: 'No',
        yes: 'Gave {n} my seat for the evaluation. {n} owes me.',
        no: 'Kept my seat. {n} watched me keep it.',
        alt: { ask: 'choice', line: 'I lost my seat. Tell me I get it back.', a: 'You will', b: 'Maybe not' }
      },
      {
        name: 'Their chance',
        ask: 'choice',
        line: 'I started. I was good. Say it.',
        a: 'You were',
        b: 'You were fine',
        yes: 'Told {n} the start was good. It was, mostly.',
        no: 'Told {n} it was fine. {n} heard “not good”.'
      }
    ]
  },
  grudge: {
    name: 'The grudge',
    beats: [
      {
        name: 'The target',
        ask: 'day',
        line: 'I have a faction to answer. Train with me until I am ready for them.',
        a: 'Train together',
        b: 'Not my grudge',
        yes: 'Trained for {n}’s grudge. Now it is a little bit mine.',
        no: 'Told {n} it is not my grudge.'
      },
      {
        name: 'The fight',
        ask: 'match',
        line: 'Next match, beside me. I want them to see us together.',
        a: 'Side by side',
        b: 'Not this time',
        yes: 'Played beside {n} like we meant it.',
        no: '{n} went into it without me.',
        alt: { ask: 'day', line: 'One more day on the floor. Then I go at them.', a: 'One more day' }
      },
      {
        name: 'The reckoning',
        ask: 'choice',
        line: 'Was it worth it? Say yes.',
        a: 'It was',
        b: 'It wasn’t',
        yes: 'Told {n} the grudge was worth it. Grudges like hearing that.',
        no: 'Told {n} it was not worth it. Honest. Unpopular.'
      }
    ]
  },
  prove: {
    name: 'Proving it',
    beats: [
      {
        name: 'The doubt',
        ask: 'day',
        line: 'The elders say I am not built for it. Train with me until they are wrong.',
        a: 'Train together',
        b: 'Not now',
        yes: 'Trained with {n} to spite the elders. Good reason.',
        no: 'Let {n} prove it alone.'
      },
      {
        name: 'The showcase',
        ask: 'match',
        line: 'Watch me play. No — play with me. Then they will see.',
        a: 'Play with them',
        b: 'Watch, maybe',
        yes: 'Played beside {n} so somebody would see. Somebody did.',
        no: '{n} played it without me.',
        alt: { ask: 'day', line: 'Then watch me train. Better: train with me.', a: 'Train together' }
      },
      {
        name: 'The proof',
        ask: 'choice',
        line: 'I proved it. Didn’t I?',
        a: 'You did',
        b: 'Not yet',
        yes: 'Told {n} it is proved. {n} will quote me.',
        no: 'Told {n} not yet. {n} will quote that too.'
      }
    ]
  },
  leave: {
    name: 'The way out',
    beats: [
      {
        name: 'The ticket',
        ask: 'money',
        amt: 120,
        line: 'A boat ticket costs a hundred and twenty. I am short.',
        a: 'Pay it',
        b: 'Not for that',
        yes: 'Paid toward {n}’s way off the island. Strange thing to buy.',
        no: 'Would not pay {n}’s ticket.'
      },
      {
        name: 'The tape',
        ask: 'day',
        line: 'An agent wants tape of me training. Run drills with me.',
        a: 'Run drills',
        b: 'Not today',
        yes: 'Ran drills with {n} for an agent who may exist.',
        no: '{n} made the tape alone.'
      },
      {
        name: 'The goodbye',
        ask: 'choice',
        line: 'If I get out, will you hate me for it?',
        a: 'Go',
        b: 'Stay',
        yes: 'Told {n} to go. Meant it, mostly.',
        no: 'Told {n} to stay. {n} looked at the sea anyway.'
      }
    ]
  }
};

Object.assign(MEMORY, {
  arc_help: { v: 8 }, // you helped one beat of their arc (spec §4.36 3)
  arc_done: { v: 20, payoff: 1 }, // you saw their arc through: the big memory
  arc_refused: { v: -6 } // you turned a beat down
});
Object.assign(MEM_TEXT, {
  arc_help: ['Helped {n} with something that mattered to {n}.', '{n} asked. I showed up.'],
  arc_done: ['Saw {n}’s thing through to the end. {n} won’t forget it.', '{n}’s whole mess, start to finish. I was there for it.'],
  arc_refused: ['{n} needed me. I said no.', 'Turned {n} down when it counted.']
});
// Ex-teammates across the net (spec §4.36 B): Agent T defines `faced_ex` in people.js; this is the stand-in until it lands (T's wins).
if (!MEMORY.faced_ex) MEMORY.faced_ex = { v: -2 };
if (!MEM_TEXT.faced_ex) MEM_TEXT.faced_ex = ['Faced {n} across the net. Strange view.', '{n} on the other side now. We both noticed.'];

/** The duo card's cut-in (spec §4.36 4): what the friend shouts when it comes into play. */
const DUO_SAY = {
  duo_quick: 'Same as practice — go!',
  duo_pin: 'Wide and high. It’s yours.',
  duo_brains: 'I read left, you read right.',
  duo_towers: 'Two walls. Nothing gets through.',
  duo_wall: 'Close it with me!',
  duo_shield: 'Back line is ours. Dig everything.'
};
