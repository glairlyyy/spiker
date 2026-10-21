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
