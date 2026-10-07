// Cinematic match lines (spec §2.18): event kind × personality → variants, picked by hash (never R()). The director
// (js/render/director.js) picks the moment and the two speakers; `kind` is said by the player it happened to, `kind_reply`
// by whoever has a stake (an opponent, a teammate, the captain). Voice: lore.md — players on court, short, shonen.
// Placeholders: {me} the speaker's first name, {them} the other speaker's, {team} the speaker's team, {score} the speaker's
// side first ("12–10").

/** kind → { pers → [lines] } ('any' = every personality). Personalities: PERS (hot, cool, cocky, shy, leader). */
const MLINES = {
  // a team enters Fever (§2.14) — said by its hottest player
  fever: {
    hot: [
      'I can’t stop now — keep it coming!!',
      'Feel that? We’re burning up!',
      'More! Give me more!!',
      'This is it — full blast!!',
      '{score}! And we’re just getting started!!'
    ],
    cool: [
      '…Everything’s slow now. Good.',
      'I can see every gap.',
      'Don’t think. Just keep scoring.',
      'We’re in. Stay in.',
      'Quiet. Let it flow.'
    ],
    cocky: [
      'Told you. Can’t touch us.',
      'Look at the scoreboard, {them}.',
      'Is that all you’ve got?',
      'We could do this all day.',
      'Somebody call it — this one’s ours.'
    ],
    shy: [
      'Is this… really us?',
      'My hands feel so light…',
      'I don’t want this to end.',
      'We’re… we’re really doing it!',
      'Everything’s going in…!'
    ],
    leader: [
      'Now we push — nobody lets up!',
      'This is our rhythm. Hold it!',
      'Same again, {team}! Same again!',
      'Stay hungry — the next one too!',
      'Ride it together — all of us!'
    ]
  },
  fever_reply: {
    hot: [
      'Then I’ll put the fire out myself!',
      'Don’t get comfortable, {them}!!',
      'I’ll stuff that grin!',
      'Burn all you want — I’m still here!',
      'Bring it! I’ll take it head on!'
    ],
    cool: [
      'Streaks end.',
      'Let them run. They’ll tire.',
      'One block changes it.',
      'They’re loud. Not better.',
      'Watch the setter. The pattern’s there.'
    ],
    cocky: [
      'Enjoy it while it lasts.',
      'Cute run. Now watch.',
      'You peaked too early, {them}.',
      'I’ve broken better streaks.',
      'All that noise for a few points?'
    ],
    shy: ['They’re so fast…', 'We just need one… just one.', 'I have to stop {them}…', 'Breathe… we can still…', 'I won’t look away.'],
    leader: [
      'Heads up! One point breaks it!',
      'Nobody panics — one rally at a time!',
      'We’ve been here before. Reset!',
      'Make them earn every ball!',
      'Their run ends with us. Now!'
    ]
  },
  // a team goes Loose — said by the player who cracked (or the captain)
  loose: {
    hot: ['Dammit — again?!', 'Why won’t it go down?!', 'I’m blowing it… I know!', 'One more chance — give me one!', 'Argh! Focus, focus!'],
    cool: ['…That wasn’t me.', 'Sloppy. Reset.', 'We’re rushing.', 'Too many mistakes. Mine too.', 'Breathe. Then fix it.'],
    cocky: [
      'That doesn’t count. Luck.',
      'Whatever. I’ll take it back.',
      'Don’t look at me like that.',
      'Just a bad bounce, okay?',
      'I meant to do that. Mostly.'
    ],
    shy: ['I’m sorry… I’m so sorry…', 'My legs won’t move…', 'Everyone’s staring…', 'I keep messing up…', 'Please, not again…'],
    leader: [
      'That’s on me. Look at me — reset!',
      'We’re shaking. Stop. Breathe.',
      'Talk to each other! Out loud!',
      'Small steps, {team}. One ball.',
      'Nobody hides. We fix this.'
    ]
  },
  loose_reply: {
    hot: [
      'Shake it off, {them}! Next one!',
      'Get angry, not scared!',
      'Hey! Eyes up! We’re not done!',
      'I’ve got your back — swing!',
      'Forget it! Fight!'
    ],
    cool: [
      'It’s one ball. Let it go.',
      'Breathe, {them}. Then play.',
      'Mistakes happen. Don’t repeat them.',
      'Your feet. Watch your feet.',
      'Simple. Keep it simple.'
    ],
    cocky: [
      'Relax, I’ll cover for you.',
      'Lucky for you, I’m here.',
      'Just pass it to me next time.',
      'Don’t worry, I’ve seen worse. Barely.',
      'Leave the hard ones to me.'
    ],
    shy: [
      'It’s okay… really, it’s okay.',
      'We all make mistakes…',
      'I believe in you, {them}…',
      'Next one… together?',
      'Don’t give up yet…'
    ],
    leader: [
      'Hands in, {team}. We reset now.',
      'You’re fine, {them}. Next ball is yours.',
      'Look at me — we’re still in this.',
      'One point. Just one. Together.',
      'We don’t crack. Not today.'
    ]
  },
  // the captain settles the team (§2.17)
  settle: {
    hot: [
      'Hey! Calm down — that means me too!',
      'Breathe! Then we go again!',
      'Stop flapping — play!',
      'Cool it! We’re better than this!',
      'Settle! Then hit back!'
    ],
    cool: ['Slow down. Our pace.', 'Breathe. Then play.', 'Back to basics.', 'Nothing’s lost. Reset.', 'Quiet heads. Clean passes.'],
    cocky: [
      'Relax. I’m still on your team.',
      'Chill. We’re the better side.',
      'Calm down, I’ve got a plan.',
      'Easy. Watch me fix this.',
      'Stop panicking — it’s embarrassing.'
    ],
    shy: [
      'Um… everyone… let’s breathe?',
      'It’s okay… we can still do it.',
      'Slowly… one ball at a time…',
      'Please… let’s calm down together.',
      'We just need to reset… right?'
    ],
    leader: [
      'Huddle up. Breathe. Basics.',
      'Look at me. We play our game.',
      'Pass, set, hit. That’s all.',
      'Nobody chases. We build it back.',
      'Feet set, hands ready. Go.'
    ]
  },
  settle_reply: {
    hot: ['Okay! Okay! I’m calm!', 'Fine — but I’m still angry!', 'Got it! Reset!', 'Right! Next one’s ours!', 'Yeah, yeah — breathing!'],
    cool: ['Understood.', 'Clean passes. Got it.', 'Reset.', 'Fine by me.', 'Basics. Yes.'],
    cocky: ['I was calm already.', 'Sure, captain.', 'Fine. Watch me be calm.', 'Relaxed. Totally.', 'Okay, okay. Plan B.'],
    shy: ['Okay… I’ll try.', 'Breathing… yes.', 'Thank you, {them}…', 'I feel a bit better…', 'One ball… okay.'],
    leader: [
      'You heard {them}. Reset!',
      'Good call. Basics.',
      'Right behind you, {them}.',
      'Let’s rebuild. Together.',
      'Back to work, {team}.'
    ]
  },
  // the captain fires the team up (§2.17)
  fireup: {
    hot: [
      'Wake up, {team}!! Let’s GO!!',
      'Louder! Faster! Harder!!',
      'I want blood on the floor!',
      'Get angry — and hit!!',
      'Fire up! Every last one of you!!'
    ],
    cool: ['Now. We push now.', 'Turn it up.', 'They’re tired. We aren’t.', 'Take the next three.', 'Pressure. All of it.'],
    cocky: [
      'Time to show off, {team}.',
      'Let’s embarrass them.',
      'Play like we mean it — like me.',
      'Make it look easy.',
      'Give them a show.'
    ],
    shy: [
      'Let’s… let’s go, everyone!',
      'I want to win this… with you!',
      'We can do it — I know we can!',
      'Please — everything we’ve got!',
      'Together… now!'
    ],
    leader: [
      'This is our moment, {team}!',
      'Everything now — leave nothing!',
      'Lift each other! Go!',
      'One more gear — find it!',
      'We take this set. Now!'
    ]
  },
  fireup_reply: {
    hot: ['YEAH!! Let’s go!!', 'I was waiting for that!!', 'You got it, {them}!!', 'Watch me!!', 'All in!!'],
    cool: ['Fine. Let’s go.', 'Ready.', '…Alright.', 'Push it is.', 'Done thinking.'],
    cocky: ['Finally, some fun.', 'Say less.', 'Show time.', 'You don’t have to ask twice.', 'I’ve been warmed up for ages.'],
    shy: ['Y-yes! I’m ready!', 'I’ll give it everything!', 'Okay… let’s go!', 'For the team!', 'I’ll try harder!'],
    leader: ['You heard {them}! Up!', 'Together — now!', 'We follow you, {them}!', 'All of us. Go!', 'Let’s make it count!']
  },
  // your fake worked: the blocker bit (§2.16)
  fake_ok: {
    hot: ['Gotcha!! You jumped at nothing!', 'Ha! Bit on that one!', 'Too slow, {them}!!', 'Fooled you!', 'Look where you jumped!'],
    cool: [
      'You read me. That was the point.',
      'Easy to fool someone who’s watching.',
      'You jumped. Thanks.',
      'Wrong one, {them}.',
      'Reading works both ways.'
    ],
    cocky: [
      'Did you think it was me? Cute.',
      'Made you look.',
      'Thanks for the jump, {them}.',
      'Who’s reading who now?',
      'I’m everywhere and nowhere.'
    ],
    shy: ['It… actually worked?', 'Sorry, {them}… not sorry.', 'I did it…!', 'You looked so sure…', 'I wasn’t really there…'],
    leader: [
      'That’s the decoy we drilled!',
      'Read me all you like — the team scores.',
      'Good. Now they’ll doubt every jump.',
      'Next time, guess again.',
      'Everybody’s a threat, {them}.'
    ]
  },
  fake_ok_reply: {
    hot: [
      'Again! Do that again, I dare you!',
      'Cheap trick!!',
      'I won’t fall for it twice!',
      'Argh! You little—',
      'Next one, I’m staying home!'
    ],
    cool: ['…Noted.', 'Once.', 'I won’t bite again.', 'Clever. Won’t work twice.', 'I’ll wait longer.'],
    cocky: ['Lucky guess.', 'I let you have that one.', 'Fine. Enjoy it.', 'That’s all you’ve got? Tricks?', 'Hide all you want.'],
    shy: ['I was so sure…', 'Ugh… I fell for it…', 'I’m sorry, everyone…', 'How did I…', 'I’ll watch closer…'],
    leader: [
      'Hold your feet! Trust the read!',
      'My mistake. Watch the setter.',
      'They’ll try it again — be ready.',
      'Good fake. Doesn’t matter.',
      'Next one, we wait together.'
    ]
  },
  // your fake failed: the blocker stayed home, or the setter set you anyway
  fake_fail: {
    hot: [
      'Why didn’t you jump?!',
      'Argh! Didn’t buy it!',
      'Fine — I’ll just hit through you!',
      'That was supposed to work!',
      'Next time for real!'
    ],
    cool: ['Didn’t bite. Smart.', 'Hm. Too obvious.', 'Noted.', 'Wrong time for that.', 'Fine. Something else.'],
    cocky: [
      'You got lucky.',
      'I wasn’t really trying.',
      'So you can think. Shocking.',
      'Okay, you passed the test.',
      'That one was a warm-up.'
    ],
    shy: ['They saw it…', 'I shouldn’t have…', 'Sorry…', 'It didn’t work…', 'I’ll try something else…'],
    leader: [
      'Fine. We go straight at them.',
      'They’re disciplined. Respect.',
      'No more tricks — just hit.',
      'Good read, {them}. Next one’s real.',
      'Change it up, {team}.'
    ]
  },
  fake_fail_reply: {
    hot: ['Not falling for that!!', 'Ha! I saw that coming!', 'Try harder, {them}!', 'Real hit or nothing!', 'Come at me for real!'],
    cool: ['Your feet gave it away.', 'Too obvious.', 'I don’t chase ghosts.', 'Patience beats tricks.', 'I watched the ball.'],
    cocky: ['Seriously? That?', 'You’re not that sneaky.', 'Saw it a mile off.', 'Was that a fake? Adorable.', 'Next.'],
    shy: ['I… didn’t jump!', 'I waited… it worked!', 'I almost fell for it…', 'Phew…', 'I’m learning…'],
    leader: [
      'Good discipline! Stay home!',
      'That’s how we read it — together.',
      'Nobody bites. Nice.',
      'Make them hit through us.',
      'Hold that wall.'
    ]
  },
  // you called, the setter said "Not now!"
  refused: {
    hot: ['I was open!! Wide open!', 'Why not me?!', 'Set me next time — I mean it!', 'I called for it!!', 'Ugh! I had that!'],
    cool: ['…Fine.', 'Next one, then.', 'Your call.', 'Understood. Not this one.', 'I’ll be there next time.'],
    cocky: ['You’ll regret that.', 'Saving me for later? Smart.', 'Wrong choice, {them}.', 'Okay, but I would’ve scored.', 'Your loss.'],
    shy: ['Oh… okay…', 'Maybe I wasn’t ready…', 'Sorry for calling…', 'Next time… maybe?', 'It’s fine…'],
    leader: [
      'Okay — I trust you, {them}.',
      'Fine. Next one I’m ready earlier.',
      'Good read, setter.',
      'Your ball. Our point.',
      'Got it. I’ll set up better.'
    ]
  },
  refused_reply: {
    hot: [
      'Not with that pass! Next one!',
      'Wait for it — you’ll get yours!',
      'Get in position first!!',
      'You’ll get it — be ready!',
      'Not now! Soon!'
    ],
    cool: ['Pass was off. Not you.', 'Wrong moment. Wait.', 'You were late.', 'Next good ball is yours.', 'Patience.'],
    cocky: ['When I say so.', 'I make the calls here.', 'Trust me, I know better.', 'You’re not ready yet.', 'Earn it.'],
    shy: ['S-sorry, I couldn’t…', 'The pass was too far…', 'Next one, I promise…', 'I’ll set you soon…', 'It wasn’t safe…'],
    leader: [
      'Hold on, {them}. The next one’s yours.',
      'Bad pass. Not your fault.',
      'Get set — I’m coming back to you.',
      'Trust the plan.',
      'I saw you. Not yet.'
    ]
  },
  // you called for it and got stuffed
  stuffed_call: {
    hot: [
      'Again! Set me again!!',
      'That wall’s coming down!',
      'Damn it!! Not over!',
      'I’ll break through next time!',
      'You won’t stop me twice!'
    ],
    cool: ['…Too predictable.', 'Wrong angle.', 'They read the call.', 'Noted.', 'Next time, the line.'],
    cocky: ['Lucky hands.', 'Enjoy that. Won’t happen again.', 'You got one. Whatever.', 'I let you touch it.', 'Cute block.'],
    shy: ['I called for it… and…', 'I’m so sorry…', 'It hit their hands…', 'Why did I call…', 'I wanted it so badly…'],
    leader: [
      'My fault. I’ll hit smarter.',
      'They’re on me. Use it.',
      'Fine — I’m the decoy now.',
      'Next one goes around them.',
      'Keep setting me. I’ll find a way.'
    ]
  },
  stuffed_call_reply: {
    hot: ['Not today!!', 'Denied!!', 'Go home, {them}!', 'That’s my net!!', 'Come again! I’ll be here!'],
    cool: ['You called it. I heard.', 'Too loud.', 'Saw it coming.', 'Wrong lane.', 'Shouting gives it away.'],
    cocky: ['Thanks for the warning.', 'Next time, whisper.', 'That’s what you get.', 'Is that your best?', 'Easy.'],
    shy: ['I… stopped it!', 'It hit my hands…!', 'I didn’t close my eyes this time!', 'I got one…!', 'Did I really…?'],
    leader: [
      'That’s the wall, {team}!',
      'Good read, everyone!',
      'Make them think twice.',
      'Same again — we know their call.',
      'Hold the line!'
    ]
  },
  // the same hitter against the same blocker for the third time
  duel: {
    hot: [
      'You again?! Good!',
      'Let’s settle this, {them}!!',
      'Every time — me against you!',
      'This time I go through you!',
      'I’ve been waiting for you!'
    ],
    cool: [
      'Third time, {them}.',
      'You keep showing up.',
      'I know your timing now.',
      'One of us has to blink.',
      'Let’s see who learned more.'
    ],
    cocky: [
      'Still trying, {them}?',
      'You must really like me.',
      'Third time’s mine.',
      'Getting tired of losing?',
      'Fine. I’ll show you again.'
    ],
    shy: ['It’s {them} again…', 'I have to beat you once…', 'You’re always there…', 'This time… please…', 'I won’t run from you.'],
    leader: [
      'Respect, {them}. Now move.',
      'You and me decide this.',
      'Third round. Let’s finish it.',
      'Best of three? Here we go.',
      'I’ll take this one for {team}.'
    ]
  },
  duel_reply: {
    hot: ['Come on then!!', 'I’ll be there every time!', 'Not through me!!', 'Bring it, {them}!!', 'Let’s go!!'],
    cool: ['I’m not moving.', 'Same answer.', 'Third time. Same wall.', 'Your timing hasn’t changed.', 'Try something new.'],
    cocky: ['You can’t get rid of me.', 'I’m your problem now.', 'Keep swinging.', 'Still here, {them}.', 'Haven’t you learned?'],
    shy: ['I… I’ll stop you!', 'I won’t move…', 'This time for sure…', 'I’m scared… but I’m here.', 'I can do this…'],
    leader: [
      'I’ll meet you every time.',
      'For {team} — not through me.',
      'Let’s finish it, {them}.',
      'Respect. Still no.',
      'Decide it, then.'
    ]
  },
  // an 8+ touch rally won — said by the winning side
  long_rally: {
    hot: [
      'WHAT a rally!! Again!!',
      'My arms are on fire — I love it!',
      'That’s volleyball!!',
      'Never giving up a ball!!',
      'Who’s tired? Not me!!'
    ],
    cool: ['…Long one. Worth it.', 'Patience won that.', 'Every ball counts.', 'We outlasted them.', 'Good. They’re breathing hard.'],
    cocky: ['Told you we’d win the long ones.', 'Endurance, {them}. Try it.', 'Was that fun for you?', 'We can go longer.', 'Tired yet?'],
    shy: ['I can’t believe we kept it up…', 'My heart’s pounding…', 'Everyone kept it alive…', 'We… won that?', 'I didn’t let it drop…!'],
    leader: [
      'That’s who we are — we don’t quit!',
      'Every one of you kept it alive!',
      'That rally’s worth three points!',
      'Remember that feeling, {team}!',
      'They’ll feel that one.'
    ]
  },
  long_rally_reply: {
    hot: ['Again! Let’s go again!', 'That was ours!! Argh!', 'I’ll win the next long one!', 'Don’t celebrate yet!!', 'Huff… one more!'],
    cool: ['…They earned it.', 'Long rallies cost them too.', 'Breathe. Next.', 'We were close.', 'Fine. Shorter next time.'],
    cocky: ['You needed all that to score?', 'Took you long enough.', 'One point. Relax.', 'Enjoy it.', 'We let you have that.'],
    shy: ['So close…', 'I almost got it…', 'My legs…', 'That was amazing… even losing it…', 'Next time…'],
    leader: [
      'Great effort — keep that energy!',
      'We lost the point, not the fight.',
      'They’re tired too. Push.',
      'Same fight, next rally!',
      'Proud of that. Now win one.'
    ]
  },
  // 3+ points back from 3+ down
  comeback: {
    hot: ['We’re BACK!! You hear me?!', 'Told you we weren’t done!', '{score}! Keep coming!!', 'Who’s scared now?!', 'Here we come!!'],
    cool: ['Gap’s closing.', 'They’re nervous now.', '{score}. Keep going.', 'It’s a game again.', 'Now we take the lead.'],
    cocky: [
      'Did you think you’d won?',
      'Nice lead. Was.',
      'Getting nervous, {them}?',
      'Classic comeback. Classic us.',
      '{score}. Feeling it?'
    ],
    shy: ['We’re… catching up!', 'I didn’t think we could…', 'Don’t stop now…!', 'Is this happening?', 'We can still win…!'],
    leader: [
      'Never doubted you, {team}!',
      'Look at that — we fought back!',
      '{score}! One point at a time!',
      'This is where we win it!',
      'Keep the pressure — don’t stop!'
    ]
  },
  comeback_reply: {
    hot: ['Don’t let them back in!!', 'Close it out — now!', 'Stop them! Somebody!', 'Not like this!!', 'We still lead — act like it!'],
    cool: ['Stay calm. Still ahead.', 'Don’t chase the score.', 'Our pace. Not theirs.', 'One point stops it.', 'Breathe.'],
    cocky: ['Relax. We’re still winning.', 'They’re just lucky.', 'I’ll end this myself.', 'Fine, make it interesting.', 'Let them dream.'],
    shy: ['They’re catching up…', 'Please… one point…', 'We were so far ahead…', 'Don’t panic… don’t panic…', 'I can help — set me!'],
    leader: [
      'Reset! We’re still ahead!',
      'One rally at a time — stop the run!',
      'Talk to each other! Close it!',
      'We’ve got this — calm!',
      'Look at me — we finish this.'
    ]
  },
  // set / match point: one line each side before the serve (the side holding it, then the other)
  setpoint: {
    hot: ['One more!! Just one more!!', 'Finish it — NOW!!', 'This is mine!!', 'Set me — I end it!', '{score}! Let’s close it!!'],
    cool: ['One point.', 'Finish it clean.', 'Nothing changes. One ball.', 'Close it.', 'Last one.'],
    cocky: ['Say goodbye, {them}.', 'Watch me end it.', 'Get the trophy ready.', 'This is the easy part.', 'One more highlight.'],
    shy: ['Just one more… please…', 'I can’t breathe…', 'We’re so close…', 'Let it be us…', 'One more… together…'],
    leader: [
      'One point, {team}. Same as always.',
      'Finish it together.',
      'Every ball like the first.',
      'Close it out — calm and clean.',
      'This one’s for all of us.'
    ]
  },
  setpoint_reply: {
    hot: [
      'Not yet!! Not done!!',
      'I’m not losing like this!',
      'Come on — one at a time!',
      'Save it! Save everything!!',
      'You’ll have to earn it!'
    ],
    cool: ['Still alive.', 'One point at a time.', 'Save this. Then the next.', 'It’s not over.', 'Breathe. Defend.'],
    cocky: ['You haven’t won yet.', 'I love these odds.', 'Watch me ruin it.', 'Pressure’s on you, {them}.', 'Choke. I dare you.'],
    shy: ['Please… not yet…', 'I don’t want it to end…', 'I’ll get every ball…', 'We can still…', 'Not like this…'],
    leader: [
      'Every ball, {team}! Every ball!',
      'We’ve saved worse. Dig in.',
      'One point at a time — save it!',
      'Nobody quits. Not now.',
      'Hold on — we take it back!'
    ]
  }
};
/** The kinds the director speaks first (each has a `_reply`), by priority (spec §2.18: stage change > captain's call > fake > …). */
const MLINE_KINDS = [
  'fever',
  'loose',
  'settle',
  'fireup',
  'fake_ok',
  'fake_fail',
  'stuffed_call',
  'refused',
  'duel',
  'long_rally',
  'comeback',
  'setpoint'
];
/** A small string hash (FNV-1a) → 0..2^32-1: the line pick, never R(). */
function mlineHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}
/**
 * One line of `kind` in p's voice (persOf), the same for the same event: `n` = the point number, `q` = the other speaker
 * (or null: {them} is `other`, the other team's name), `team` = p's team name, `score` = "12–10" from p's side.
 */
function mlinePick(kind, p, q, team, score, n, other) {
  const T = MLINES[kind],
    L = (T && (T[persOf(p)] || T.any)) || null;
  if (!L || !L.length) return '';
  return L[mlineHash(`${kind}|${p.id}|${n}`) % L.length]
    .replace(/\{me\}/g, firstName(p))
    .replace(/\{them\}/g, q ? firstName(q) : other || '')
    .replace(/\{team\}/g, team || '')
    .replace(/\{score\}/g, score || '');
}
